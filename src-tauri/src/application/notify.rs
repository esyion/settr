//! 用户维度的推送应用层:登录用户维度的实时通知通道。
//!
//! 与组织维度推送 `application::push` 完全独立 —— 注册表、连接代际、循环、
//! 事件出口各自维护；严格保持通知与组织内容变更正交
//! （`docs/messagePushSubscribe.md` §4.1）。
//!
//! 推送语义：仅投递"信号"（通知 ID/标题/正文/跳转），具体已读/列表由前端走
//! 既有 HTTP 接口拉取，避免在实时通道回送全量数据。

use crate::domain::push::{parse_sse_frames, reconnect_delay};
use crate::dto::notify::NotifyChangeEventDto;
use futures_util::StreamExt;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::watch;

/// SSE 增量解析缓冲上限(字节):与组织推送保持一致。
const MAX_PARSE_BUFFER_BYTES: usize = 1024 * 1024;

/// 用户维度推送事件:连接生命周期与通知信号。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotifyEvent {
    /// 连接已建立
    Connected,
    /// 连接断开(网络故障/服务重启),自动退避重连
    Disconnected,
    /// 认证失效(401),重连已停止,等待前端换新 token 重连
    Unauthorized,
    /// 通知信号:客户端收到后写本地 store + 按需弹系统通知 + 拉取详情
    Notify {
        /// 通知 ID 字符串（雪花）
        notification_id: String,
        /// 业务分类字符串
        category: String,
        /// 渲染标题
        title: String,
        /// 渲染正文（可空）
        body: Option<String>,
        /// 跳转目标（`agentsplus://...`，可空）
        deep_link: Option<String>,
    },
}

/// 推送事件出口端口：把连接生命周期与通知信号转达给 UI 层。
pub trait NotifyEventSink: Send + Sync {
    /**
     * 转达一个推送事件（基础设施实现负责映射为 webview 事件）。
     *
     * @param event 推送事件
     */
    fn emit(&self, event: NotifyEvent);
}

/// 用户维度推送连接参数。
#[derive(Debug, Clone)]
pub struct NotifySpec {
    /// 后端 API base URL（已通过 shared::url 校验）
    pub base_url: String,
    /// 当前 access token
    pub access_token: String,
}

/// 一条已打开的推送流：HTTP 状态码 + 分块字节流。
pub struct NotifyStream {
    /// HTTP 响应状态码
    pub status: u16,
    /// 服务端推来的原始字节分块
    pub chunks: Pin<Box<dyn futures_util::Stream<Item = Result<Vec<u8>, String>> + Send>>,
}

/// 推送流工厂端口：抽象"按参数打开一条用户维度 SSE 连接"。
pub trait NotifyStreamFactory: Send + Sync {
    /**
     * 打开一条推送流。
     *
     * @param spec 连接参数
     * @return 推送流；网络级失败返回 Err
     */
    fn open(
        &self,
        spec: &NotifySpec,
    ) -> Pin<Box<dyn Future<Output = Result<NotifyStream, String>> + Send + '_>>;
}

/// 循环退出回调：协调器用于在连接结束后解除登记。
pub type NotifyLoopFinishHook = Arc<dyn Fn() + Send + Sync>;

/**
 * 运行推送连接主循环：连接 → 消费信号 → 断线退避重连，直到停止信号或认证失效。
 *
 * 重连策略与 `application::push::run_push_loop` 对齐：
 * - 200 正常结束后退避重试；
 * - 401 直接停止；
 * - 其他错误同样退避重试。
 *
 * @param spec      连接参数
 * @param stop      停止信号（true = 要求退出）
 * @param factory   推送流工厂
 * @param sink      事件出口
 * @param on_finish 循环退出回调
 */
pub async fn run_notify_loop(
    spec: NotifySpec,
    mut stop: watch::Receiver<bool>,
    factory: Arc<dyn NotifyStreamFactory>,
    sink: Arc<dyn NotifyEventSink>,
    on_finish: NotifyLoopFinishHook,
) {
    let mut attempt: u32 = 0;
    loop {
        if *stop.borrow_and_update() {
            sink.emit(NotifyEvent::Disconnected);
            on_finish();
            return;
        }
        let open_result = tokio::select! {
            stop_result = stop.changed() => {
                if stop_result.is_err() || *stop.borrow() {
                    sink.emit(NotifyEvent::Disconnected);
                    on_finish();
                    return;
                }
                continue;
            }
            result = factory.open(&spec) => result,
        };
        match open_result {
            Ok(stream) if stream.status == 401 => {
                sink.emit(NotifyEvent::Unauthorized);
                on_finish();
                return;
            }
            Ok(stream) if stream.status != 200 => {
                attempt += 1;
                sink.emit(NotifyEvent::Disconnected);
                if !backoff_sleep(&mut stop, attempt).await {
                    on_finish();
                    return;
                }
            }
            Ok(stream) => {
                attempt = 0;
                sink.emit(NotifyEvent::Connected);
                if consume_stream(stream, &mut stop, &sink).await {
                    sink.emit(NotifyEvent::Disconnected);
                    on_finish();
                    return;
                }
            }
            Err(error) => {
                attempt += 1;
                log::debug!("用户推送建连失败: {error}");
                sink.emit(NotifyEvent::Disconnected);
                if !backoff_sleep(&mut stop, attempt).await {
                    on_finish();
                    return;
                }
            }
        }
    }
}

/// 消费流直到出错或停止；返回 true 表示收到停止信号。
async fn consume_stream(
    mut stream: NotifyStream,
    stop: &mut watch::Receiver<bool>,
    sink: &Arc<dyn NotifyEventSink>,
) -> bool {
    let mut buffer = String::new();
    loop {
        tokio::select! {
            stop_result = stop.changed() => {
                if stop_result.is_err() || *stop.borrow() {
                    return true;
                }
            }
            chunk = stream.chunks.next() => {
                match chunk {
                    None => return false,
                    Some(Err(error)) => {
                        log::debug!("用户推送读取错误: {error}");
                        return false;
                    }
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        if buffer.len() > MAX_PARSE_BUFFER_BYTES {
                            log::warn!("用户推送解析缓冲超限,重同步");
                            buffer.clear();
                        }
                        for frame in parse_sse_frames(&mut buffer) {
                            if frame.event.as_deref() != Some("notify") {
                                continue;
                            }
                            match serde_json::from_str::<NotifyChangeEventDto>(&frame.data) {
                                Ok(dto) => sink.emit(NotifyEvent::Notify {
                                    notification_id: dto.notification_id,
                                    category: dto.category,
                                    title: dto.title,
                                    body: dto.body,
                                    deep_link: dto.deep_link,
                                }),
                                Err(error) => log::warn!("用户推送事件解析失败: {error}"),
                            }
                        }
                    }
                }
            }
        }
    }
}

async fn backoff_sleep(stop: &mut watch::Receiver<bool>, attempt: u32) -> bool {
    let jitter = pseudo_jitter();
    let delay = reconnect_delay(attempt, jitter);
    tokio::select! {
        _ = tokio::time::sleep(delay) => true,
        _ = stop.changed() => *stop.borrow(),
    }
}

/// 伪随机抖动源（纳秒分数位）：退避抖动无需密码学强度，
/// 取系统时钟纳秒即可打散多客户端的重连时刻。
fn pseudo_jitter() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    (nanos as f64) / 1_000_000_000.0
}

/// 协调器:维护"同一时刻至多一条"用户推送连接 + 代际。
#[derive(Default)]
pub struct NotifyCoordinator {
    stop: std::sync::Mutex<Option<watch::Sender<bool>>>,
    generation: AtomicU64,
}

impl NotifyCoordinator {
    /**
     * 激活一条新连接(替换旧连接)。
     *
     * @param stop_sender 新连接的停止信号发送端
     * @return 本连接代际
     */
    pub fn activate(&self, stop_sender: watch::Sender<bool>) -> u64 {
        if let Ok(mut guard) = self.stop.lock() {
            if let Some(previous) = guard.take() {
                let _ = previous.send(true);
            }
            *guard = Some(stop_sender);
        }
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    /**
     * 主动停止当前连接(幂等)。
     */
    pub fn stop_active(&self) {
        if let Ok(mut guard) = self.stop.lock() {
            if let Some(sender) = guard.take() {
                let _ = sender.send(true);
            }
        }
    }

    /**
     * 当前是否登记着活跃连接。
     */
    /**
     * 当前活跃连接代际(无连接时返回 None)。
     */
    pub fn current_generation(&self) -> Option<u64> {
        if self.has_active() {
            Some(self.generation.load(Ordering::SeqCst))
        } else {
            None
        }
    }

    /**
     * 当前是否登记着活跃连接。
     */
    pub fn has_active(&self) -> bool {
        self.stop.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /**
     * 仅当本连接仍是当前连接时注销(身份感知注销)。
     */
    pub fn deactivate_if_current(&self, generation: u64) {
        if self.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Ok(mut guard) = self.stop.lock() {
            *guard = None;
        }
    }
}
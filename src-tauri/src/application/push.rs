//! 推送应用层:组织变更推送连接的用例编排。
//!
//! 通过端口抽象外部依赖:网络流由 [`PushStreamFactory`] 提供,事件出口由
//! [`PushEventSink`] 提供(基础设施分别用 reqwest 与 Tauri 事件实现)。
//! 本层不依赖 Tauri 运行时,便于用 fake 端口单测完整重连循环。
//!
//! 推送语义:连接只送"信号",不带数据。收到 org-change 信号后由前端
//! 重走既有拉取接口;断线、丢信号、服务重启的正确性由"拉"兜底,
//! "推"只负责把收敛延迟从分钟级降到秒级。

use crate::domain::push::{parse_sse_frames, reconnect_delay};
use crate::dto::push::PushChangeEventDto;
use futures_util::StreamExt;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::watch;

// 测试拆分至同级 push_test.rs(§4.2 行数指引);push.rs 的子模块默认解析到
// push/ 子目录,需 #[path] 显式指回同级文件,保证测试真的参与编译。
#[cfg(test)]
#[path = "push_test.rs"]
mod push_test;

/// SSE 增量解析缓冲上限(字节):异常服务端无空行洪流时丢弃重同步。
const MAX_PARSE_BUFFER_BYTES: usize = 1024 * 1024;

/// 组织变更信号:服务端已确认该组织内容有变,前端应重拉对应数据。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PushEvent {
    /// 连接已建立(可随后收到变更信号)
    Connected,
    /// 连接断开(网络故障/服务重启),客户端将自动退避重连
    Disconnected,
    /// 认证失效(401),重连已停止,等待前端以新 token 重新 push_connect
    Unauthorized,
    /// 组织内容变更信号
    Change {
        /// 发生变化的组织 ID
        organization_id: String,
        /// 变更类型(POLICY / SKILL)
        change_type: String,
        /// 组织最新变更游标 id
        change_id: String,
    },
}

/// 推送事件出口端口:把连接生命周期与变更信号转达给 UI 层。
pub trait PushEventSink: Send + Sync {
    /**
     * 转达一个推送事件(基础设施实现负责映射为 webview 事件)。
     *
     * @param event 推送事件
     */
    fn emit(&self, event: PushEvent);
}

/// 推送连接参数。
#[derive(Debug, Clone)]
pub struct PushSpec {
    /// 后端 API base URL(已通过 shared::url 校验)
    pub base_url: String,
    /// 当前 access token
    pub access_token: String,
    /// 订阅的组织 ID
    pub organization_id: String,
}

/// 一条已打开的推送流:HTTP 状态码 + 分块字节流。
pub struct PushStream {
    /// HTTP 响应状态码(200 为成功;401 表示认证失效)
    pub status: u16,
    /// 服务端推来的原始字节分块(错误映射为 String,不泄露驱动类型)
    pub chunks: Pin<Box<dyn futures_util::Stream<Item = Result<Vec<u8>, String>> + Send>>,
}

/// 推送流工厂端口:抽象"按参数打开一条 SSE 连接"。
pub trait PushStreamFactory: Send + Sync {
    /**
     * 打开一条推送流。
     *
     * @param spec 连接参数
     * @return 推送流;网络级失败(连接不上等)返回 Err
     */
    fn open(
        &self,
        spec: &PushSpec,
    ) -> Pin<Box<dyn Future<Output = Result<PushStream, String>> + Send + '_>>;
}

/// 循环退出回调:协调器用于在连接结束后解除登记(401/停止/替换均会触发)。
pub type PushLoopFinishHook = Arc<dyn Fn() + Send + Sync>;

/**
 * 运行推送连接主循环:连接 → 消费信号 → 断线退避重连,直到停止信号或认证失效。
 *
 * 重连策略:200 的流正常结束视为可重试断线(指数退避);401 视为认证失效
 * 直接停止(等前端换新 token 重新 push_connect);其余非 200 与网络错误
 * 同样退避重试。所有等待点(建连、退避、读流)都可被停止信号及时打断,
 * 不存在无法取消的阶段;无论以何种方式退出,都会触发 `on_finish`。
 *
 * @param spec      连接参数
 * @param stop      停止信号(true = 要求退出)
 * @param factory   推送流工厂
 * @param sink      事件出口
 * @param on_finish 循环退出回调(解除协调器登记)
 */
pub async fn run_push_loop(
    spec: PushSpec,
    mut stop: watch::Receiver<bool>,
    factory: Arc<dyn PushStreamFactory>,
    sink: Arc<dyn PushEventSink>,
    on_finish: PushLoopFinishHook,
) {
    let mut attempt: u32 = 0;
    loop {
        if *stop.borrow_and_update() {
            sink.emit(PushEvent::Disconnected);
            on_finish();
            return;
        }
        // 建连必须可取消:响应头等待若被服务端/代理挂死,不能让任务与
        // socket 永久泄漏(stop 或替换连接时要能立即退出)。
        let open_result = tokio::select! {
            stop_result = stop.changed() => {
                if stop_result.is_err() || *stop.borrow() {
                    sink.emit(PushEvent::Disconnected);
                    on_finish();
                    return;
                }
                continue;
            }
            result = factory.open(&spec) => result,
        };
        match open_result {
            Ok(stream) if stream.status == 401 => {
                sink.emit(PushEvent::Unauthorized);
                on_finish();
                return;
            }
            Ok(stream) if stream.status != 200 => {
                attempt += 1;
                sink.emit(PushEvent::Disconnected);
                if !backoff_sleep(&mut stop, attempt).await {
                    on_finish();
                    return;
                }
            }
            Ok(stream) => {
                attempt = 0;
                sink.emit(PushEvent::Connected);
                if consume_stream(stream, &mut stop, &sink).await {
                    sink.emit(PushEvent::Disconnected);
                    on_finish();
                    return;
                }
                attempt += 1;
                sink.emit(PushEvent::Disconnected);
                if !backoff_sleep(&mut stop, attempt).await {
                    on_finish();
                    return;
                }
            }
            Err(_) => {
                attempt += 1;
                sink.emit(PushEvent::Disconnected);
                if !backoff_sleep(&mut stop, attempt).await {
                    on_finish();
                    return;
                }
            }
        }
    }
}

/**
 * 消费一条已建立的流:分块喂给 SSE 解析器,把 org-change 帧转为变更信号。
 *
 * @return true 表示要求停止;false 表示流自然/异常结束(应重连)
 */
async fn consume_stream(
    mut stream: PushStream,
    stop: &mut watch::Receiver<bool>,
    sink: &Arc<dyn PushEventSink>,
) -> bool {
    let mut buffer = String::new();
    loop {
        tokio::select! {
            stop_result = stop.changed() => {
                // changed() 返回 Err 表示停止信号发送端已被丢弃(连接被替换),同样视为停止。
                if stop_result.is_err() || *stop.borrow() {
                    return true;
                }
            }
            chunk = stream.chunks.next() => {
                match chunk {
                    None => return false,
                    Some(Err(_)) => return false,
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        // 防御异常服务端无空行洪流:缓冲超限直接丢弃重同步,
                        // 正常 SSE 帧远小于该阈值。
                        if buffer.len() > MAX_PARSE_BUFFER_BYTES {
                            log::warn!("推送缓冲超限,丢弃待解析内容重新同步");
                            buffer.clear();
                        }
                        for frame in parse_sse_frames(&mut buffer) {
                            if frame.event.as_deref() != Some("org-change") {
                                continue;
                            }
                            match serde_json::from_str::<PushChangeEventDto>(&frame.data) {
                                Ok(payload) => sink.emit(PushEvent::Change {
                                    organization_id: payload.organization_id,
                                    change_type: payload.change_type,
                                    change_id: payload.change_id,
                                }),
                                Err(error) => {
                                    log::warn!("推送帧解析失败,已忽略: {error}");
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 退避等待;期间停止信号触发时返回 false(应退出循环)。
 */
async fn backoff_sleep(stop: &mut watch::Receiver<bool>, attempt: u32) -> bool {
    let jitter = pseudo_jitter();
    let delay = reconnect_delay(attempt, jitter);
    tokio::select! {
        _ = tokio::time::sleep(delay) => true,
        _ = stop.changed() => false,
    }
}

/**
 * 伪随机抖动源(纳秒分数位):退避抖动无需密码学强度,
 * 取系统时钟纳秒即可打散多客户端的重连时刻。
 */
fn pseudo_jitter() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.subsec_nanos())
        .unwrap_or(0);
    (nanos % 1_000) as f64 / 1_000.0
}

/**
 * 推送连接协调器:持有当前活跃连接的停止信号与代际,支撑"新连接替换旧
 * 连接"与显式断开。全局唯一,由 AppState 以 Arc 持有。
 *
 * 代际(generation)单调递增:循环退出回调凭代际解除登记,避免旧循环
 * 误清新连接;事件出口凭代际丢弃已被替换连接的迟到事件。
 */
#[derive(Default)]
pub struct PushCoordinator {
    /// 当前登记:(代际, 停止信号);None 表示无活跃连接。
    active: std::sync::Mutex<Option<(u64, watch::Sender<bool>)>>,
    /// 代际发生器。
    generation: AtomicU64,
}

impl PushCoordinator {
    /**
     * 激活一条新连接:先停掉旧连接(若有),登记新停止信号并返回其代际。
     *
     * @param stop 新连接的停止信号发送端
     * @return 新连接的代际(退出回调与事件过滤用)
     */
    pub fn activate(&self, stop: watch::Sender<bool>) -> u64 {
        let generation = self.generation.fetch_add(1, Ordering::Relaxed) + 1;
        let mut guard = self.lock();
        if let Some((_, previous)) = guard.take() {
            let _ = previous.send(true);
        }
        *guard = Some((generation, stop));
        generation
    }

    /**
     * 停止当前连接(幂等);无活跃连接时空操作。
     */
    pub fn stop_active(&self) {
        let mut guard = self.lock();
        if let Some((_, active)) = guard.take() {
            let _ = active.send(true);
        }
    }

    /**
     * 仅当代际仍为当前登记的连接时解除登记(循环退出回调用,幂等)。
     *
     * @param generation 循环启动时拿到的代际
     */
    pub fn deactivate_if_current(&self, generation: u64) {
        let mut guard = self.lock();
        if matches!(&*guard, Some((current, _)) if *current == generation) {
            guard.take();
        }
    }

    /**
     * 当前登记连接的代际;无活跃连接时返回 None(事件出口过滤用)。
     */
    pub fn current_generation(&self) -> Option<u64> {
        self.lock().as_ref().map(|(generation, _)| *generation)
    }

    /**
     * 是否存在登记中的连接(仅表示"已被要求运行",实际连通性以状态事件为准)。
     */
    pub fn has_active(&self) -> bool {
        self.lock().is_some()
    }

    /**
     * 取锁:锁中毒时直接恢复内部数据(本结构无复杂不变量,中毒只是有线程
     * 在持锁时 panic,状态本身仍可用),与 settings 命令的既有惯例一致。
     */
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<(u64, watch::Sender<bool>)>> {
        self.active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

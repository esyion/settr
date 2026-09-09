//! 推送基础设施:基于 reqwest 的 SSE 流适配器与 webview 事件出口。
//!
//! [`ReqwestPushStreamFactory`] 实现应用层 [`PushStreamFactory`] 端口
//! (流式读取、错误映射为 String,不向应用层泄露驱动类型);
//! [`WebviewPushEventSink`] 实现应用层 [`PushEventSink`] 端口,
//! 把连接状态与变更信号映射为 IPC DTO 后发到 webview。

use crate::application::push::{
    PushCoordinator, PushEvent, PushEventSink, PushSpec, PushStream, PushStreamFactory,
};
use crate::dto::push::{PushChangePayload, PushStatusPayload};
use crate::shared::url::validate_backend_base_url;
use futures_util::StreamExt;
use reqwest::header::{ACCEPT, AUTHORIZATION};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// webview 收到的连接状态事件名(与前端 services/push 约定一致)。
pub const EVENT_PUSH_STATUS: &str = "push://status";
/// webview 收到的组织变更信号事件名。
pub const EVENT_PUSH_CHANGE: &str = "push://org-change";

/**
 * reqwest 实现的推送流工厂:GET /api/v1/organizations/{org}/events/stream。
 *
 * 连接校验复用 shared::url 的 HTTPS-only 单一来源;SSE 是长连接,
 * 只设连接超时不设总超时(总超时会掐断长读)。
 */
pub struct ReqwestPushStreamFactory;

impl PushStreamFactory for ReqwestPushStreamFactory {
    /**
     * 打开一条 SSE 推送流(见 trait 文档)。
     */
    fn open(
        &self,
        spec: &PushSpec,
    ) -> Pin<Box<dyn Future<Output = Result<PushStream, String>> + Send + '_>> {
        let spec = PushSpec {
            base_url: spec.base_url.clone(),
            access_token: spec.access_token.clone(),
            organization_id: spec.organization_id.clone(),
        };
        Box::pin(async move {
            let base = validate_backend_base_url(&spec.base_url)?;
            let url = format!(
                "{base}/api/v1/organizations/{}/events/stream",
                spec.organization_id
            );
            let client = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .user_agent(concat!("Agents Plus/", env!("CARGO_PKG_VERSION")))
                .build()
                .map_err(|error| format!("无法初始化网络客户端: {error}"))?;
            let mut request = client
                .get(&url)
                .header(ACCEPT, "text/event-stream")
                .header("Accept-Encoding", "identity");
            if !spec.access_token.is_empty() {
                request = request.header(AUTHORIZATION, format!("Bearer {}", spec.access_token));
            }
            let response = request.send().await.map_err(|error| {
                if error.is_timeout() {
                    "NETWORK_TIMEOUT:连接后端超时".to_string()
                } else {
                    format!("NETWORK_ERROR:{error}")
                }
            })?;
            let status = response.status().as_u16();
            let chunks = response
                .bytes_stream()
                .map(|item| item.map(|bytes| bytes.to_vec()).map_err(|e| e.to_string()))
                .boxed();
            Ok(PushStream { status, chunks })
        })
    }
}

/**
 * webview 事件出口:把应用层推送事件映射为 DTO 后 emit 到全部窗口。
 *
 * 持有连接代际:已被更新连接替换的旧循环,其迟到事件(如替换后才产生的
 * Disconnected)会被丢弃,避免打翻新连接已上报的状态。
 * token 等敏感信息不进入事件载荷;emit 失败(无窗口等)仅记录日志。
 */
pub struct WebviewPushEventSink {
    app: AppHandle,
    coordinator: Arc<PushCoordinator>,
    generation: u64,
}

impl WebviewPushEventSink {
    /**
     * Creates sink.
     *
     * @param app         Tauri 应用句柄
     * @param coordinator 推送协调器(读当前代际做迟到事件过滤)
     * @param generation  本连接的代际
     */
    pub fn new(app: AppHandle, coordinator: Arc<PushCoordinator>, generation: u64) -> Self {
        Self {
            app,
            coordinator,
            generation,
        }
    }

    /**
     * 本连接是否仍是协调器登记中的当前连接。
     */
    fn is_current(&self) -> bool {
        self.coordinator.current_generation() == Some(self.generation)
    }
}

impl PushEventSink for WebviewPushEventSink {
    /**
     * 把推送事件映射为 webview 事件(见 struct 文档)。
     */
    fn emit(&self, event: PushEvent) {
        if !self.is_current() {
            log::debug!(
                "丢弃已替换连接的迟到推送事件: generation={}",
                self.generation
            );
            return;
        }
        let result = match event {
            PushEvent::Connected => self.app.emit(
                EVENT_PUSH_STATUS,
                PushStatusPayload {
                    state: "connected".to_string(),
                },
            ),
            PushEvent::Disconnected => self.app.emit(
                EVENT_PUSH_STATUS,
                PushStatusPayload {
                    state: "disconnected".to_string(),
                },
            ),
            PushEvent::Unauthorized => self.app.emit(
                EVENT_PUSH_STATUS,
                PushStatusPayload {
                    state: "unauthorized".to_string(),
                },
            ),
            PushEvent::Change {
                organization_id,
                change_type,
                change_id,
            } => self.app.emit(
                EVENT_PUSH_CHANGE,
                PushChangePayload {
                    organization_id,
                    change_type,
                    change_id,
                },
            ),
        };
        if let Err(error) = result {
            log::warn!("推送事件发往 webview 失败: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ReqwestPushStreamFactory, EVENT_PUSH_CHANGE, EVENT_PUSH_STATUS};
    use crate::application::push::{PushSpec, PushStreamFactory};

    /// 非法 base URL 在打开流之前即被拒绝(HTTPS-only 单一来源校验)。
    #[tokio::test]
    async fn rejects_invalid_base_url_before_connecting() {
        let factory = ReqwestPushStreamFactory;
        let spec = PushSpec {
            base_url: "http://insecure.example.com".to_string(),
            access_token: "token".to_string(),
            organization_id: "1".to_string(),
        };
        let result = PushStreamFactory::open(&factory, &spec).await;
        assert!(result.is_err());
    }

    /// 空 access token 的请求仍会发起(服务端按未认证处理,返回 401),
    /// 但非法地址一定在打开流之前被拒绝。
    #[tokio::test]
    async fn local_http_base_url_is_allowed() {
        let factory = ReqwestPushStreamFactory;
        let spec = PushSpec {
            base_url: "http://127.0.0.1:9".to_string(),
            access_token: String::new(),
            organization_id: "1".to_string(),
        };
        // 端口 9 无服务,预期网络层错误而非校验错误。
        let result = PushStreamFactory::open(&factory, &spec).await;
        assert!(result.is_err());
    }

    /// 事件名常量与前端约定保持稳定(防手滑改名)。
    #[test]
    fn event_names_are_stable() {
        assert_eq!(EVENT_PUSH_STATUS, "push://status");
        assert_eq!(EVENT_PUSH_CHANGE, "push://org-change");
    }
}

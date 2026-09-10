//! 用户维度推送 IPC DTO(camelCase,与前端 services/push 网关对应)。

use serde::{Deserialize, Serialize};

/**
 * push_subscribe_user 命令的请求参数。
 *
 * 字段经 serde 映射为 camelCase；access_token 由前端从 session-store 传入，
 * 仅在内存中持有,不落盘、不打日志。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifySubscribeRequest {
    /// 后端 API base URL(与设置页 apiBaseUrl 同源)
    pub base_url: String,
    /// 当前登录会话的 access token
    pub access_token: String,
}

/**
 * push_subscribe_user / push_unsubscribe_user / push_user_status 的响应:当前推送连接状态。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyStatusDto {
    /// 是否存在活跃(或正在建立)的推送连接
    pub connected: bool,
}

/**
 * 服务端 notify SSE 事件载荷(仅反序列化服务端推送帧)。
 *
 * 字段对应 docs/messagePushSubscribe.md §4.2 服务端 SseNotifyPayload。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyChangeEventDto {
    /// 通知 ID 字符串(雪花跨边界)
    pub notification_id: String,
    /// 业务分类字符串
    pub category: String,
    /// 渲染标题
    pub title: String,
    /// 渲染正文(可空)
    pub body: Option<String>,
    /// 跳转目标(可空)
    pub deep_link: Option<String>,
}

/**
 * 发给 webview 的 notify 事件载荷(push://notify)。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyEventPayload {
    pub notification_id: String,
    pub category: String,
    pub title: String,
    pub body: Option<String>,
    pub deep_link: Option<String>,
}

/**
 * 发给 webview 的连接状态事件载荷(push://notify-status)。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyStatusPayload {
    /// connected / disconnected / unauthorized
    pub state: String,
}

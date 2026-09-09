//! 推送连接的 IPC DTO(camelCase,与前端 services/push 网关对应)。

use serde::{Deserialize, Serialize};

/**
 * push_connect 命令的请求参数。
 *
 * 字段经 serde 映射为 camelCase;access_token 由前端从 session-store 传入,
 * 仅在内存中持有,不落盘、不打日志。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushConnectRequest {
    /// 后端 API base URL(与设置页保存的 apiBaseUrl 同源)
    pub base_url: String,
    /// 当前登录会话的 access token
    pub access_token: String,
    /// 订阅的组织 ID(字符串雪花 ID,跨边界禁止 number)
    pub organization_id: String,
}

/**
 * push_connect / push_disconnect 的响应:当前推送连接状态。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushStatusDto {
    /// 是否存在活跃(或正在建立)的推送连接
    pub connected: bool,
    /// 当前连接订阅的组织 ID;未连接时为 null
    pub organization_id: Option<String>,
}

/**
 * SSE org-change 事件载荷(与服务端 SseChangePayload 对应)。
 *
 * 仅用于反序列化服务端推送帧;ID 字段按跨边界契约保持字符串。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushChangeEventDto {
    /// 发生变化的组织 ID
    pub organization_id: String,
    /// 变更类型(POLICY / SKILL)
    pub change_type: String,
    /// 组织当前最新变更游标 id
    pub change_id: String,
}

/**
 * 发给 webview 的 org-change 事件载荷(push://org-change)。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushChangePayload {
    /// 发生变化的组织 ID
    pub organization_id: String,
    /// 变更类型(POLICY / SKILL)
    pub change_type: String,
    /// 组织当前最新变更游标 id
    pub change_id: String,
}

/**
 * 发给 webview 的连接状态事件载荷(push://status)。
 */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushStatusPayload {
    /// connected / disconnected / unauthorized
    pub state: String,
}

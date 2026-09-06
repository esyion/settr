//! 客户端全局应用状态(AGENTS.md §6 全局共享状态集中组装)。
//!
//! 通过 Tauri 的 manage 注入;所有 command 从 State<\'_, AppState> 拿到一份。
//! 当前阶段只含 API base URL 与 auth token(MVP);后续可加 device snapshot / sync state。

use std::sync::Arc;

/// 鉴权上下文(由 commands::auth::auth 模块写入)。
#[derive(Default, Debug)]
pub struct AuthContext {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub device_id: String,
    pub session_id: String,
}

/// 全局应用状态。
#[derive(Default, Debug)]
pub struct AppState {
    /// 后端 API base URL(初始化时由前端通过 invoke 设置)。
    pub api_base_url: String,
    /// 鉴权上下文。
    pub auth: AuthContext,
}

/// 线程安全的 Arc 包装,方便异步 task 间共享(MVP 暂未深度使用,留扩展点)。
pub type SharedAppState = Arc<AppState>;

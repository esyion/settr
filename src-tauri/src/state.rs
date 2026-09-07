//! 客户端全局应用状态(AGENTS.md §6 全局共享状态集中组装)。
//!
//! 通过 Tauri 的 manage 注入;所有 command 从 State<'_, AppState> 拿到一份。

/// 全局应用状态。
#[derive(Default, Debug)]
pub struct AppState {
    /// 后端 API base URL(为空时由 SkillContext 回退到环境变量)。
    pub api_base_url: String,
}

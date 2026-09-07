//! 设置模块 IPC DTO(AGENTS.md §5 显式数据契约)。

/// 设置读取响应。
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    /// 后端 API base URL。
    pub api_base_url: String,
    /// 关闭窗口时是否最小化到托盘。
    pub close_to_tray: bool,
    /// 启动时自动检查云端状态。
    pub startup_check: bool,
}

/// 设置更新请求。
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsRequest {
    /// 新的后端 API base URL(原始输入,由应用层校验)。
    pub api_base_url: String,
    /// 关闭到托盘开关;None 表示保持当前值(契约向后兼容)。
    pub close_to_tray: Option<bool>,
    /// 启动时检查开关;None 表示保持当前值。
    pub startup_check: Option<bool>,
}

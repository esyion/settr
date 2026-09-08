//! 应用设置用例与模型(AGENTS.md §4.3)。
//!
//! 设置是用户在本机保存的偏好(当前仅后端地址),持久化由
//! infrastructure::settings_store 负责;本模块只定义模型、默认值与校验编排。

/// 用户本机设置。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 后端 API base URL(归一化后,无尾部斜杠)。
    pub api_base_url: String,
    /// 关闭窗口时是否最小化到托盘(默认开启;false 时点关闭直接退出)。
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    /// 启动时自动检查云端状态(默认开启;false 时进入页面不自动刷新)。
    #[serde(default = "default_true")]
    pub startup_check: bool,
}

/**
 * serde 默认值:关闭到托盘默认开启,保持历史行为。
 */
fn default_true() -> bool {
    true
}

impl AppSettings {
    /**
     * 返回编译期默认设置。
     * <p>
     * 默认后端地址优先取构建时注入的 NEXT_PUBLIC_API_BASE_URL(生产 CI 注入),
     * 未注入时回退本地调试地址;运行时用户配置(settings.json)会覆盖该默认值。
     */
    pub fn default_with_env() -> Self {
        let api_base_url = std::env::var("NEXT_PUBLIC_API_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:19999".to_string());
        Self {
            api_base_url,
            close_to_tray: true,
            startup_check: true,
        }
    }

    /**
     * 校验并返回仅更新后端地址的新设置实例(保留其余字段)。
     * <p>
     * 地址规则由 shared::url 单一来源校验(HTTPS-only),
     * 通过后返回去尾部斜杠的副本,避免覆盖用户其他偏好。
     */
    pub fn with_api_base_url(&self, raw: &str) -> Result<Self, String> {
        let api_base_url = crate::shared::url::validate_backend_base_url(raw)?;
        Ok(Self {
            api_base_url,
            close_to_tray: self.close_to_tray,
            startup_check: self.startup_check,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    /// 更新地址时应保留其他开关字段,不被重置。
    #[test]
    fn with_api_base_url_preserves_flags() {
        let original = AppSettings {
            api_base_url: "https://old.example.com".to_string(),
            close_to_tray: false,
            startup_check: false,
        };
        let updated = original
            .with_api_base_url("https://new.example.com/")
            .expect("更新失败");
        assert_eq!(updated.api_base_url, "https://new.example.com");
        assert!(!updated.close_to_tray);
        assert!(!updated.startup_check);
    }

    /// 非法地址应拒绝且不产生新实例。
    #[test]
    fn with_api_base_url_rejects_invalid() {
        let original = AppSettings::default_with_env();
        assert!(original.with_api_base_url("not-a-url").is_err());
        assert!(original
            .with_api_base_url("http://api.example.com")
            .is_err());
    }

    /// 编译期默认设置的地址应非空。
    #[test]
    fn default_with_env_has_non_empty_base_url() {
        let settings = AppSettings::default_with_env();
        assert!(!settings.api_base_url.is_empty());
    }
}

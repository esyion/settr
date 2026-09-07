//! 用户设置持久化(infrastructure 适配器)。
//!
//! 以 JSON 文件保存用户本机设置,写入复用 atomic_file 原子替换,
//! 避免进程中断导致文件损坏;不向上层暴露文件细节。

use crate::application::settings::AppSettings;
use crate::infrastructure::atomic_file::write_json_atomically;
use std::path::{Path, PathBuf};

/**
 * 设置文件存储适配器。
 * <p>
 * 路径由应用启动时通过平台推荐配置目录解析(AppHandle::app_config_dir),
 * 本类型自身不依赖 Tauri 运行时,保持 infrastructure 可独立测试。
 */
pub struct SettingsStore {
    file_path: PathBuf,
}

impl SettingsStore {
    /**
     * 以设置文件完整路径构造存储适配器。
     */
    pub fn new(file_path: PathBuf) -> Self {
        Self { file_path }
    }

    /**
     * 读取设置;文件不存在或损坏时返回编译期默认设置。
     * <p>
     * 损坏文件不阻断启动:记录警告并回退默认值,下次保存会覆盖损坏内容。
     */
    pub fn load(&self) -> Result<AppSettings, String> {
        let path: &Path = self.file_path.as_path();
        if !path.exists() {
            return Ok(AppSettings::default_with_env());
        }
        let raw =
            std::fs::read_to_string(path).map_err(|error| format!("无法读取设置文件: {error}"))?;
        match serde_json::from_str::<AppSettings>(&raw) {
            Ok(settings) => Ok(settings),
            Err(error) => {
                log::warn!("设置文件损坏,已回退默认值: {error}");
                Ok(AppSettings::default_with_env())
            }
        }
    }

    /**
     * 原子保存设置(临时文件 + 替换)。
     */
    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
        write_json_atomically(&self.file_path, settings)
    }

    /**
     * 返回设置文件路径(诊断用)。
     */
    pub fn file_path(&self) -> &Path {
        &self.file_path
    }
}

#[cfg(test)]
mod tests {
    use super::SettingsStore;
    use crate::application::settings::AppSettings;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    /**
     * 构造唯一的临时目录,测试结束后整体清理。
     */
    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agents-plus-test-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&dir).expect("无法创建临时目录");
        dir
    }

    /// 保存后读取应往返一致。
    #[test]
    fn save_then_load_roundtrip() {
        let dir = temp_dir();
        let store = SettingsStore::new(dir.join("settings.json"));
        let settings = AppSettings {
            api_base_url: "https://api.example.com".to_string(),
            close_to_tray: false,
            startup_check: false,
        };
        store.save(&settings).expect("保存失败");
        let loaded = store.load().expect("读取失败");
        assert_eq!(loaded, settings);
        fs::remove_dir_all(&dir).ok();
    }

    /// 文件不存在时应返回编译期默认设置(地址非空)。
    #[test]
    fn load_missing_file_returns_default() {
        let dir = temp_dir();
        let store = SettingsStore::new(dir.join("missing.json"));
        let loaded = store.load().expect("读取失败");
        assert!(!loaded.api_base_url.is_empty());
        assert!(loaded.close_to_tray);
        assert!(loaded.startup_check);
        fs::remove_dir_all(&dir).ok();
    }

    /// 损坏的 JSON 不应 panic,应回退默认值。
    #[test]
    fn load_corrupted_file_falls_back_to_default() {
        let dir = temp_dir();
        let file = dir.join("settings.json");
        fs::write(&file, "{ not valid json").expect("写入失败");
        let store = SettingsStore::new(file);
        let loaded = store.load().expect("读取失败");
        assert!(!loaded.api_base_url.is_empty());
        assert!(loaded.close_to_tray);
        fs::remove_dir_all(&dir).ok();
    }

    /// 旧格式(仅 apiBaseUrl)应兼容读取,开关字段取 serde 默认 true。
    #[test]
    fn load_legacy_format_keeps_defaults() {
        let dir = temp_dir();
        let file = dir.join("settings.json");
        fs::write(&file, r#"{"apiBaseUrl":"https://api.example.com"}"#).expect("写入失败");
        let store = SettingsStore::new(file);
        let loaded = store.load().expect("读取失败");
        assert_eq!(loaded.api_base_url, "https://api.example.com");
        assert!(loaded.close_to_tray);
        assert!(loaded.startup_check);
        fs::remove_dir_all(&dir).ok();
    }
}

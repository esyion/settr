//! 客户端全局应用状态(AGENTS.md §6 全局共享状态集中组装)。
//!
//! 通过 Tauri 的 manage 注入;所有 command 从 State<'_, AppState> 拿到一份。
//! 设置值放在 std RwLock 后:锁粒度仅覆盖内存读写,持久化 I/O 在锁外执行。

use crate::application::settings::AppSettings;
use crate::infrastructure::settings_store::SettingsStore;
use std::sync::RwLock;

/// 全局应用状态。
pub struct AppState {
    /// 用户本机设置(内存视图;修改需同时持久化到 settings_store)。
    pub settings: RwLock<AppSettings>,
    /// 设置持久化适配器(文件路径已在启动时解析)。
    pub settings_store: SettingsStore,
}

impl AppState {
    /**
     * 以存储适配器构造状态:立即加载一次设置作为内存初始值。
     * <p>
     * 加载失败时回退编译期默认值(SettingsStore::load 已保证不阻断启动)。
     */
    pub fn new(settings_store: SettingsStore) -> Self {
        let settings = settings_store.load().unwrap_or_else(|error| {
            log::warn!("加载设置失败,使用默认值: {error}");
            AppSettings::default_with_env()
        });
        Self {
            settings: RwLock::new(settings),
            settings_store,
        }
    }
}

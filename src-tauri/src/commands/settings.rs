//! 设置模块 Tauri commands(接口层薄适配器,AGENTS.md §4.2)。

use crate::dto::settings::{SettingsDto, UpdateSettingsRequest};
use crate::state::AppState;
use tauri::State;

/**
 * 读取用户设置。
 * <p>
 * 设置值来自内存视图(启动时已从磁盘加载);只读操作,无 I/O。
 */
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsDto, String> {
    let settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    Ok(SettingsDto {
        api_base_url: settings.api_base_url,
        close_to_tray: settings.close_to_tray,
        startup_check: settings.startup_check,
    })
}

/**
 * 更新用户设置(当前支持后端地址)。
 * <p>
 * 顺序:校验(锁外) → 持久化(锁外) → 更新内存视图。
 * 持久化失败时不改内存,保证内存与磁盘一致;错误文案对 IPC 稳定。
 */
#[tauri::command]
pub fn update_settings(
    state: State<'_, AppState>,
    request: UpdateSettingsRequest,
) -> Result<SettingsDto, String> {
    let next = {
        let guard = state
            .settings
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut candidate = guard.with_api_base_url(&request.api_base_url)?;
        if let Some(close_to_tray) = request.close_to_tray {
            candidate.close_to_tray = close_to_tray;
        }
        if let Some(startup_check) = request.startup_check {
            candidate.startup_check = startup_check;
        }
        candidate
    };
    state.settings_store.save(&next)?;
    let api_base_url = next.api_base_url.clone();
    let close_to_tray = next.close_to_tray;
    let startup_check = next.startup_check;
    let mut guard = state
        .settings
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = next;
    drop(guard);
    Ok(SettingsDto {
        api_base_url,
        close_to_tray,
        startup_check,
    })
}

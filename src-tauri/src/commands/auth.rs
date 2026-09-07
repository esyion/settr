//! 认证会话凭据的 Tauri command 薄适配器。
//!
//! 会话以 JSON 字符串形式持久化到 OS keyring;前端通过 invoke 调用。

use keyring::Entry;

const KEYRING_SERVICE: &str = "com.msi.agents-plus";
const KEYRING_USER: &str = "auth-session";

/// 从 OS keyring 读取已保存的登录会话 JSON;不存在返回 None。
#[tauri::command]
pub fn get_auth_session() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("无法访问系统凭据存储: {error}"))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("无法读取系统凭据: {error}")),
    }
}

/// 将登录会话 JSON 写入 OS keyring 并回读校验;超过 32 KiB 拒绝。
#[tauri::command]
pub fn save_auth_session(session: String) -> Result<(), String> {
    if session.len() > 32_768 {
        return Err("会话数据过大".to_string());
    }
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("无法访问系统凭据存储: {error}"))?;
    entry
        .set_password(&session)
        .map_err(|error| format!("无法保存系统凭据: {error}"))?;
    match entry.get_password() {
        Ok(saved) if saved == session => Ok(()),
        Ok(_) => Err("系统凭据写入校验失败，请检查系统凭据存储权限".to_string()),
        Err(error) => Err(format!("系统凭据写入后无法读取: {error}")),
    }
}

/// 删除 OS keyring 中的登录会话;条目不存在视为已清理成功。
#[tauri::command]
pub fn clear_auth_session() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("无法访问系统凭据存储: {error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法清理系统凭据: {error}")),
    }
}

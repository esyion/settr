use keyring::Entry;
const KEYRING_SERVICE: &str = "com.msi.agents-plus";
const KEYRING_USER: &str = "auth-session";

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

#[tauri::command]
pub fn clear_auth_session() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("无法访问系统凭据存储: {error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法清理系统凭据: {error}")),
    }
}

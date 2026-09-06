use crate::shared::error::SkillError;
use keyring::Entry;

const KEYRING_SERVICE: &str = "com.msi.agents-plus";
const KEYRING_USER: &str = "auth-session";
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub session_id: String,
}

/// 从 keyring 读取 access_token;不存在或解析失败返回 NotAuthenticated。
/// <p>
/// 与 commands::auth::get_auth_session 共用同一 service+user。
pub fn read_access_token() -> Result<String, SkillError> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| SkillError::Internal(format!("访问系统凭据失败: {e}")))?;
    let raw = match entry.get_password() {
        Ok(v) => v,
        Err(keyring::Error::NoEntry) => return Err(SkillError::NotAuthenticated),
        Err(e) => return Err(SkillError::Internal(format!("读取系统凭据失败: {e}"))),
    };
    let parsed: Result<StoredSession, _> = serde_json::from_str(&raw);
    match parsed {
        Ok(s) if !s.access_token.is_empty() => Ok(s.access_token),
        Ok(_) => Err(SkillError::NotAuthenticated),
        Err(_) => Err(SkillError::NotAuthenticated),
    }
}

/// 顺便读整个 session(给前端需要时用)。
pub fn read_full_session() -> Result<StoredSession, SkillError> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| SkillError::Internal(format!("访问系统凭据失败: {e}")))?;
    let raw = match entry.get_password() {
        Ok(v) => v,
        Err(keyring::Error::NoEntry) => return Err(SkillError::NotAuthenticated),
        Err(e) => return Err(SkillError::Internal(format!("读取系统凭据失败: {e}"))),
    };
    serde_json::from_str(&raw).map_err(|_| SkillError::NotAuthenticated)
}


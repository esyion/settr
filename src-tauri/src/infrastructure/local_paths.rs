use super::atomic_file::replace_file;
use std::env;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const APP_DIR: &str = ".agents-plus";
const LEGACY_DOCUMENT_DIR: &str = ".agents";
const DOCUMENT_NAME: &str = "AGENTS.md";
const MANIFEST_FILE: &str = "manifest.json";
const DEVICE_FILE: &str = "device.json";

/// Returns the current user's home directory from the platform environment.
pub fn home_dir() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户主目录".to_string())
}
/// Returns the canonical path of the primary `AGENTS.md` file.
pub fn document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(DOCUMENT_NAME))
}
/// Returns the path of the legacy `~/.agents/AGENTS.md` file.
pub fn legacy_document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(LEGACY_DOCUMENT_DIR).join(DOCUMENT_NAME))
}
/// Returns the directory used for Agents Plus local metadata.
pub fn app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(APP_DIR))
}
/// Returns the legacy directory used by older Agents Plus versions.
pub fn legacy_app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(LEGACY_DOCUMENT_DIR).join(APP_DIR))
}
/// Returns the current manifest path.
pub fn manifest_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(MANIFEST_FILE))
}
/// Returns the legacy manifest path.
pub fn legacy_manifest_path() -> Result<PathBuf, String> {
    Ok(legacy_app_dir()?.join(MANIFEST_FILE))
}
/// Returns the current device identity path.
pub fn device_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(DEVICE_FILE))
}
/// Returns the legacy device identity path.
pub fn legacy_device_path() -> Result<PathBuf, String> {
    Ok(legacy_app_dir()?.join(DEVICE_FILE))
}
/// Ensures the Agents Plus metadata directory exists.
pub fn ensure_app_dir() -> Result<PathBuf, String> {
    let directory = app_dir()?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建本地同步目录: {error}"))?;
    Ok(directory)
}

/// Returns the primary document path and migrates the legacy document when needed.
pub fn ensure_primary_document() -> Result<PathBuf, String> {
    let primary = document_path()?;
    if primary.exists() {
        return Ok(primary);
    }
    let legacy = legacy_document_path()?;
    if !legacy.exists() {
        return Ok(primary);
    }
    let parent = primary
        .parent()
        .ok_or_else(|| "AGENTS.md 路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建用户主目录: {error}"))?;
    let temp = parent.join(format!(".AGENTS.md.migrate-{}", Uuid::new_v4().simple()));
    fs::copy(&legacy, &temp)
        .map_err(|error| format!("无法迁移旧版 ~/.agents/AGENTS.md: {error}"))?;
    replace_file(&temp, &primary)?;
    Ok(primary)
}

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

pub fn home_dir() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户主目录".to_string())
}
pub fn document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(DOCUMENT_NAME))
}
pub fn legacy_document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(LEGACY_DOCUMENT_DIR).join(DOCUMENT_NAME))
}
pub fn app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(APP_DIR))
}
pub fn legacy_app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(LEGACY_DOCUMENT_DIR).join(APP_DIR))
}
pub fn manifest_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(MANIFEST_FILE))
}
pub fn legacy_manifest_path() -> Result<PathBuf, String> {
    Ok(legacy_app_dir()?.join(MANIFEST_FILE))
}
pub fn device_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(DEVICE_FILE))
}
pub fn legacy_device_path() -> Result<PathBuf, String> {
    Ok(legacy_app_dir()?.join(DEVICE_FILE))
}
pub fn ensure_app_dir() -> Result<PathBuf, String> {
    let directory = app_dir()?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建本地同步目录: {error}"))?;
    Ok(directory)
}

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

use super::atomic_file::replace_file;
use crate::domain::document_format::{DocumentFormat, SUPPORTED_FORMATS};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const APP_DIR: &str = ".agents-plus";
const LEGACY_DOCUMENT_DIR: &str = ".agents";
const AGENTS_MANIFEST_FILE: &str = "manifest.json";
const DEVICE_FILE: &str = "device.json";

/// Returns the current user's home directory from the platform environment.
pub fn home_dir() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户主目录".to_string())
}
/// Returns the canonical path of a supported rule document.
pub fn document_path(format: DocumentFormat) -> Result<PathBuf, String> {
    let home = home_dir()?;
    Ok(match format.directory_name() {
        Some(directory) => home.join(directory).join(format.file_name()),
        None => home.join(format.file_name()),
    })
}
/// Returns the path of the legacy `~/.agents/AGENTS.md` file.
pub fn legacy_agents_document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join(LEGACY_DOCUMENT_DIR)
        .join(DocumentFormat::AgentsMd.file_name()))
}
/// Returns the directory used for Agents Plus local metadata.
pub fn app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(APP_DIR))
}
/// Returns the legacy directory used by older Agents Plus versions.
pub fn legacy_app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(LEGACY_DOCUMENT_DIR).join(APP_DIR))
}
/// Returns the manifest path for a supported rule format.
pub fn manifest_path(format: DocumentFormat) -> Result<PathBuf, String> {
    Ok(app_dir()?.join(format.manifest_file_name()))
}
/// Returns the legacy Agents manifest path.
pub fn legacy_agents_manifest_path() -> Result<PathBuf, String> {
    Ok(legacy_app_dir()?.join(AGENTS_MANIFEST_FILE))
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
/// Ensures the containing directory for a supported rule document exists.
pub fn ensure_document_parent(format: DocumentFormat) -> Result<PathBuf, String> {
    let home = home_dir()?;
    let directory = match format.directory_name() {
        Some(name) => home.join(name),
        None => home,
    };
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建本地规则目录: {error}"))?;
    Ok(directory)
}
/// Ensures the document parent exists and migrates the legacy Agents document when needed.
pub fn ensure_primary_document(format: DocumentFormat) -> Result<PathBuf, String> {
    ensure_document_parent(format)?;
    let primary = document_path(format)?;
    if format != DocumentFormat::AgentsMd || primary.exists() {
        return Ok(primary);
    }

    let legacy = legacy_agents_document_path()?;
    if !legacy.exists() {
        return Ok(primary);
    }
    let parent = primary
        .parent()
        .ok_or_else(|| format!("{} 路径无效", format.file_name()))?;
    let temp = parent.join(format!(
        ".{}.migrate-{}",
        format.file_name(),
        Uuid::new_v4().simple()
    ));
    fs::copy(&legacy, &temp)
        .map_err(|error| format!("无法迁移旧版 ~/.agents/AGENTS.md: {error}"))?;
    replace_file(&temp, &primary)?;
    Ok(primary)
}
/// Returns all document paths used by the local watcher.
pub fn document_paths() -> Result<Vec<PathBuf>, String> {
    SUPPORTED_FORMATS
        .iter()
        .map(|format| document_path(*format))
        .collect()
}
/// Returns only the unique parent directories that contain supported documents.
pub fn document_directories() -> Result<Vec<PathBuf>, String> {
    let mut directories = Vec::new();
    for format in SUPPORTED_FORMATS {
        let path = document_path(format)?;
        let directory = parent_directory(&path)?;
        if !directories.iter().any(|candidate| candidate == &directory) {
            directories.push(directory);
        }
    }
    Ok(directories)
}
/// Returns the parent directory for a document path.
fn parent_directory(path: &Path) -> Result<PathBuf, String> {
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "本地规则路径无效".to_string())
}

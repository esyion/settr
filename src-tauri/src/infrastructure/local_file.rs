use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MANIFEST_SCHEMA_VERSION: u32 = 1;
const APP_DIR: &str = ".agents-plus";
const DOCUMENT_DIR: &str = ".agents";
const DOCUMENT_NAME: &str = "AGENTS.md";
const DEVICE_FILE: &str = "device.json";
const MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalManifest {
    pub schema_version: u32,
    pub document_id: Option<String>,
    pub device_id: Option<String>,
    pub base_revision_id: Option<String>,
    pub base_content_hash: Option<String>,
    pub last_applied_revision_id: Option<String>,
    pub last_synced_at: Option<String>,
    pub local_content_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileSnapshot {
    pub exists: bool,
    pub display_path: String,
    pub bytes: u64,
    pub modified_at_ms: Option<u64>,
    pub content: Option<String>,
    pub content_hash: Option<String>,
    pub manifest: LocalManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub app_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDocumentRequest {
    pub content: String,
    pub expected_content_hash: Option<String>,
    pub manifest: LocalManifest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManifestRequest {
    pub manifest: LocalManifest,
}

fn home_dir() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户主目录".to_string())
}
fn document_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(DOCUMENT_DIR).join(DOCUMENT_NAME))
}
fn app_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(DOCUMENT_DIR).join(APP_DIR))
}
fn manifest_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(MANIFEST_FILE))
}
fn device_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(DEVICE_FILE))
}
fn ensure_app_dir() -> Result<PathBuf, String> {
    let directory = app_dir()?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建本地同步目录: {error}"))?;
    Ok(directory)
}

fn read_manifest() -> Result<LocalManifest, String> {
    let path = manifest_path()?;
    if !path.exists() {
        return Ok(LocalManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            ..LocalManifest::default()
        });
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("无法读取同步元数据: {error}"))?;
    let mut manifest: LocalManifest =
        serde_json::from_str(&content).map_err(|error| format!("同步元数据格式损坏: {error}"))?;
    if manifest.schema_version == 0 {
        manifest.schema_version = MANIFEST_SCHEMA_VERSION;
    }
    Ok(manifest)
}

fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let source_wide: Vec<u16> = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let destination_wide: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let replaced = unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if replaced == 0 {
            return Err(format!(
                "无法完成本地文件原子替换: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    fs::rename(source, destination).map_err(|error| format!("无法完成本地文件原子替换: {error}"))
}
fn write_json_atomically(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "本地路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建本地目录: {error}"))?;
    let temp_path = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name().unwrap_or_default().to_string_lossy(),
        Uuid::new_v4().simple()
    ));
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("无法序列化本地元数据: {error}"))?;
    {
        let mut file =
            File::create(&temp_path).map_err(|error| format!("无法写入本地临时文件: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("无法写入本地元数据: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法持久化本地元数据: {error}"))?;
    }
    replace_file(&temp_path, path)
}

fn hash_content(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    format!("sha256:{digest:x}")
}
fn modified_at_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

pub fn read_snapshot() -> Result<LocalFileSnapshot, String> {
    let path = document_path()?;
    let manifest = read_manifest()?;
    if !path.exists() {
        return Ok(LocalFileSnapshot {
            exists: false,
            display_path: "~/.agents/AGENTS.md".to_string(),
            bytes: 0,
            modified_at_ms: None,
            content: None,
            content_hash: None,
            manifest,
        });
    }
    let metadata =
        fs::metadata(&path).map_err(|error| format!("无法读取 AGENTS.md 文件信息: {error}"))?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("AGENTS.md 必须是有效的 UTF-8 文件: {error}"))?;
    Ok(LocalFileSnapshot {
        exists: true,
        display_path: "~/.agents/AGENTS.md".to_string(),
        bytes: content.len() as u64,
        modified_at_ms: modified_at_ms(&metadata),
        content_hash: Some(hash_content(&content)),
        content: Some(content),
        manifest,
    })
}

pub fn get_device_identity(app_version: &str) -> Result<DeviceIdentity, String> {
    ensure_app_dir()?;
    let path = device_path()?;
    if path.exists() {
        let content =
            fs::read_to_string(path).map_err(|error| format!("无法读取设备标识: {error}"))?;
        let mut identity: DeviceIdentity =
            serde_json::from_str(&content).map_err(|error| format!("设备标识格式损坏: {error}"))?;
        identity.app_version = app_version.to_string();
        return Ok(identity);
    }
    let device_name = env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "这台电脑".to_string());
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let identity = DeviceIdentity {
        device_id: Uuid::new_v4().simple().to_string(),
        device_name,
        platform: platform.to_string(),
        app_version: app_version.to_string(),
    };
    write_json_atomically(&path, &identity)?;
    Ok(identity)
}

pub fn save_manifest(mut manifest: LocalManifest) -> Result<LocalManifest, String> {
    ensure_app_dir()?;
    manifest.schema_version = MANIFEST_SCHEMA_VERSION;
    write_json_atomically(&manifest_path()?, &manifest)?;
    Ok(manifest)
}

pub fn apply_document(request: ApplyDocumentRequest) -> Result<LocalFileSnapshot, String> {
    let path = document_path()?;
    let current = read_snapshot()?;
    if let Some(expected) = request.expected_content_hash.as_deref() {
        if current.content_hash.as_deref() != Some(expected) {
            return Err(
                "LOCAL_FILE_CHANGED:本地文件在同步期间发生了变化，未覆盖原文件".to_string(),
            );
        }
    }
    if request.content.len() > 1_048_576 {
        return Err("CONTENT_TOO_LARGE:AGENTS.md 超过服务端允许的大小".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "AGENTS.md 路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建 ~/.agents 目录: {error}"))?;
    let backup_dir = app_dir()?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| format!("无法创建本地备份目录: {error}"))?;
    if path.exists() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        fs::copy(&path, backup_dir.join(format!("AGENTS-{timestamp}.md")))
            .map_err(|error| format!("无法创建远程覆盖前备份: {error}"))?;
    }
    let temp_path = parent.join(format!(".AGENTS.md.tmp-{}", Uuid::new_v4().simple()));
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| format!("无法创建 AGENTS.md 临时文件: {error}"))?;
        file.write_all(request.content.as_bytes())
            .map_err(|error| format!("无法写入 AGENTS.md 临时文件: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法持久化 AGENTS.md 临时文件: {error}"))?;
    }
    replace_file(&temp_path, &path)?;
    save_manifest(request.manifest)?;
    read_snapshot()
}

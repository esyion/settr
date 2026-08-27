use super::atomic_file::write_json_atomically;
use super::local_paths::{
    app_dir, device_path, ensure_app_dir, ensure_primary_document, legacy_device_path,
    legacy_manifest_path, manifest_path,
};
use crate::hash::sha256_hex;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MANIFEST_SCHEMA_VERSION: u32 = 1;

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

/// Reads the persisted synchronization manifest, including the legacy location when present.
fn read_manifest() -> Result<LocalManifest, String> {
    let path = manifest_path()?;
    let source = if path.exists() {
        path
    } else {
        legacy_manifest_path()?
    };
    if !source.exists() {
        return Ok(LocalManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            ..LocalManifest::default()
        });
    }
    let content =
        fs::read_to_string(source).map_err(|error| format!("无法读取同步元数据: {error}"))?;
    let mut manifest: LocalManifest =
        serde_json::from_str(&content).map_err(|error| format!("同步元数据格式损坏: {error}"))?;
    if manifest.schema_version == 0 {
        manifest.schema_version = MANIFEST_SCHEMA_VERSION;
    }
    Ok(manifest)
}
/// Converts a filesystem modification timestamp to milliseconds since the Unix epoch.
fn modified_at_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

/// Reads the local document, metadata, content hash, and synchronization manifest.
pub fn read_snapshot() -> Result<LocalFileSnapshot, String> {
    let path = ensure_primary_document()?;
    let manifest = read_manifest()?;
    if !path.exists() {
        return Ok(LocalFileSnapshot {
            exists: false,
            display_path: "~/AGENTS.md".to_string(),
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
        display_path: "~/AGENTS.md".to_string(),
        bytes: content.len() as u64,
        modified_at_ms: modified_at_ms(&metadata),
        content_hash: Some(sha256_hex(&content)),
        content: Some(content),
        manifest,
    })
}

/// Loads or creates the stable device identity used by the remote API.
pub fn get_device_identity(app_version: &str) -> Result<DeviceIdentity, String> {
    ensure_app_dir()?;
    let path = device_path()?;
    let source = if path.exists() {
        path.clone()
    } else {
        legacy_device_path()?
    };
    if source.exists() {
        let content =
            fs::read_to_string(source).map_err(|error| format!("无法读取设备标识: {error}"))?;
        let mut identity: DeviceIdentity =
            serde_json::from_str(&content).map_err(|error| format!("设备标识格式损坏: {error}"))?;
        identity.app_version = app_version.to_string();
        if !path.exists() {
            write_json_atomically(&path, &identity)?;
        }
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

/// Persists a synchronization manifest using an atomic JSON replacement.
pub fn save_manifest(mut manifest: LocalManifest) -> Result<LocalManifest, String> {
    ensure_app_dir()?;
    manifest.schema_version = MANIFEST_SCHEMA_VERSION;
    write_json_atomically(&manifest_path()?, &manifest)?;
    Ok(manifest)
}

/// Safely applies remote content after validating the local expected hash and creating a backup.
pub fn apply_document(request: ApplyDocumentRequest) -> Result<LocalFileSnapshot, String> {
    let path = ensure_primary_document()?;
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
    fs::create_dir_all(parent).map_err(|error| format!("无法创建用户主目录: {error}"))?;
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
    super::atomic_file::replace_file(&temp_path, &path)?;
    save_manifest(request.manifest)?;
    read_snapshot()
}

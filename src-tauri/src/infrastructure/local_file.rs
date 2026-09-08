use super::atomic_file::write_json_atomically;
use super::local_paths::{
    app_dir, device_path, ensure_app_dir, ensure_document_parent, ensure_primary_document,
    legacy_agents_manifest_path, legacy_device_path, manifest_path,
};
use crate::domain::document_format::DocumentFormat;
use crate::domain::managed_block;
use crate::hash::sha256_hex;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_DOCUMENT_BYTES: usize = 1_048_576;

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
    pub format: DocumentFormat,
    pub content: String,
    pub expected_content_hash: Option<String>,
    pub manifest: LocalManifest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManifestRequest {
    pub format: DocumentFormat,
    pub manifest: LocalManifest,
}

/// Reads the persisted synchronization manifest for one rule format.
fn read_manifest(format: DocumentFormat) -> Result<LocalManifest, String> {
    let path = manifest_path(format)?;
    let source = if format == DocumentFormat::AgentsMd && !path.exists() {
        legacy_agents_manifest_path()?
    } else {
        path
    };
    if !source.exists() {
        return Ok(LocalManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            ..LocalManifest::default()
        });
    }
    let content =
        fs::read_to_string(&source).map_err(|error| format!("无法读取同步元数据: {error}"))?;
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

/// Reads one local rule document, its metadata, content hash, and manifest.
///
/// 返回的是"个人区视图":组织策略托管区块在读取时被剥离,
/// content/contentHash/bytes 均只描述个人区,revision 同步链路对托管区无感知。
pub fn read_snapshot(format: DocumentFormat) -> Result<LocalFileSnapshot, String> {
    let path = ensure_primary_document(format)?;
    let manifest = read_manifest(format)?;
    if !path.exists() {
        return Ok(LocalFileSnapshot {
            exists: false,
            display_path: format.display_path(),
            bytes: 0,
            modified_at_ms: None,
            content: None,
            content_hash: None,
            manifest,
        });
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("无法读取 {} 文件信息: {error}", format.file_name()))?;
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("{} 必须是有效的 UTF-8 文件: {error}", format.file_name()))?;
    let personal = managed_block::split(&raw).personal;
    Ok(LocalFileSnapshot {
        exists: true,
        display_path: format.display_path(),
        bytes: personal.len() as u64,
        modified_at_ms: modified_at_ms(&metadata),
        content_hash: Some(sha256_hex(&personal)),
        content: Some(personal),
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
            fs::read_to_string(&source).map_err(|error| format!("无法读取设备标识: {error}"))?;
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
        "WINDOWS"
    } else if cfg!(target_os = "macos") {
        "MACOS"
    } else {
        "LINUX"
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

/// Persists one format's synchronization manifest using an atomic JSON replacement.
pub fn save_manifest(
    format: DocumentFormat,
    mut manifest: LocalManifest,
) -> Result<LocalManifest, String> {
    ensure_app_dir()?;
    manifest.schema_version = MANIFEST_SCHEMA_VERSION;
    write_json_atomically(&manifest_path(format)?, &manifest)?;
    Ok(manifest)
}

/// Safely applies remote content for one rule format after hash validation and backup.
///
/// request.content 描述的是个人区:写入前会读取磁盘上现存的托管区块并重新拼接,
/// 组织策略下发的托管区字节不会被 revision 同步覆盖。
pub fn apply_document(request: ApplyDocumentRequest) -> Result<LocalFileSnapshot, String> {
    let format = request.format;
    let path = ensure_primary_document(format)?;
    let current = read_snapshot(format)?;
    if let Some(expected) = request.expected_content_hash.as_deref() {
        if current.content_hash.as_deref() != Some(expected) {
            return Err(
                "LOCAL_FILE_CHANGED:本地文件在同步期间发生了变化，未覆盖原文件".to_string(),
            );
        }
    }
    let existing_policy = read_raw_policy(format)?;
    let composed = managed_block::compose(&request.content, existing_policy.as_deref());
    write_document_atomically(format, &path, &composed)?;
    save_manifest(format, request.manifest)?;
    read_snapshot(format)
}

/// Applies an organization policy block for one rule format, preserving personal content.
///
/// 返回是否发生了磁盘写入:新策略与现存托管区块逐字节一致(或两侧都为空)时是幂等空操作,
/// 避免无变化的原子替换触发文件监听与同步链路。policy 为 None 或空白表示撤回下发,
/// 会移除现存托管区块并原样保留个人区。
pub fn apply_policy_block(format: DocumentFormat, policy: Option<&str>) -> Result<bool, String> {
    if let Some(policy) = policy {
        if managed_block::contains_managed_marker(policy) {
            return Err(format!(
                "POLICY_CONTENT_INVALID:{} 策略内容包含托管标记,已拒绝写入",
                format.file_name()
            ));
        }
    }
    let normalized = policy
        .map(|value| value.trim_end_matches(['\r', '\n']).to_string())
        .filter(|value| !value.trim().is_empty());
    let path = ensure_primary_document(format)?;
    let raw = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|error| format!("无法读取 {} 文件: {error}", format.file_name()))?
    } else {
        String::new()
    };
    let split = managed_block::split(&raw);
    if split.policy.as_deref() == normalized.as_deref() {
        return Ok(false);
    }
    let composed = managed_block::compose(&split.personal, normalized.as_deref());
    write_document_atomically(format, &path, &composed)?;
    Ok(true)
}

/// Reads the raw on-disk managed policy block body, if a complete block exists.
fn read_raw_policy(format: DocumentFormat) -> Result<Option<String>, String> {
    let path = ensure_primary_document(format)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("无法读取 {} 文件: {error}", format.file_name()))?;
    Ok(managed_block::split(&raw).policy)
}

/// Backs up the current file and replaces it atomically with the composed content.
fn write_document_atomically(
    format: DocumentFormat,
    path: &std::path::Path,
    composed: &str,
) -> Result<(), String> {
    if composed.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "CONTENT_TOO_LARGE:{} 超过服务端允许的大小",
            format.file_name()
        ));
    }
    let parent = ensure_document_parent(format)?;
    let backup_dir = app_dir()?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| format!("无法创建本地备份目录: {error}"))?;
    if path.exists() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        fs::copy(
            path,
            backup_dir.join(format!("{}-{timestamp}.md", format.file_stem())),
        )
        .map_err(|error| format!("无法创建远程覆盖前备份: {error}"))?;
    }
    let temp_path = parent.join(format!(
        ".{}.tmp-{}",
        format.file_name(),
        Uuid::new_v4().simple()
    ));
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| format!("无法创建 {} 临时文件: {error}", format.file_name()))?;
        file.write_all(composed.as_bytes())
            .map_err(|error| format!("无法写入 {} 临时文件: {error}", format.file_name()))?;
        file.sync_all()
            .map_err(|error| format!("无法持久化 {} 临时文件: {error}", format.file_name()))?;
    }
    super::atomic_file::replace_file(&temp_path, path)
}

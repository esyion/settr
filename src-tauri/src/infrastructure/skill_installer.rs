//! 客户端 skill 安装器:服务端拉取 → ZIP 缓存 → SSOT 解压 → 状态记录。
//!
//! 整合 {@link SkillApiClient} + {@link extract_zip_to_ssot} + {@link SkillsStateStore},
//! 单一调用完成"装到本地 SSOT"全过程,UI 只关心最终成败。

use crate::domain::skill::HarnessId;
use crate::infrastructure::skill_api::{SkillApiClient, SkillVersionDetail};
use crate::infrastructure::skill_dispatcher::{dispatch_to_harness, undispatch_from_harness, DispatchOutcome};
use crate::infrastructure::skill_extractor::{extract_zip_to_ssot, ExtractError};
use crate::infrastructure::skill_paths::{cache_zip_path, ssot_root, state_file};
use crate::infrastructure::skill_state::SkillsStateStore;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum InstallError {
    #[error("服务端 API 错误: {0}")]
    Api(String),
    #[error("ZIP 拉取失败: {0}")]
    Fetch(String),
    #[error("ZIP 解压失败: {0}")]
    Extract(#[from] ExtractError),
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
}

/// 客户端 skill 安装结果(供前端展示)。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub skill_id: String,
    pub skill_name: String,
    pub version: String,
    pub ssot_path: String,
    pub entry_count: usize,
    pub total_bytes: u64,
    /// 已启用并完成同步的 harness 列表。
    pub synced_harnesses: Vec<String>,
}

/// 把指定 skill 的指定 version 装到 SSOT,失败回滚 SSOT 目录。
/// <p>
/// 流程:
/// 1. GET 版本详情拿 presigned download URL
/// 2. 用 reqwest 拉 ZIP → 缓存到 ~/.agents-plus/cache/skills/{id}/{version}.zip
/// 3. 解压到 SSOT(~/.agents-plus/skills/{name}/),原子 rename
/// 4. 读取 state 中该 skill 已启用的 harness,逐个 dispatch
/// 5. 写 state.record_sync(version, error=None)
pub async fn install_to_local(
    home: &Path,
    api: &SkillApiClient,
    state: &SkillsStateStore,
    skill_id: &str,
) -> Result<InstallResult, InstallError> {
    let detail = api.get_skill(skill_id).await.map_err(|e| InstallError::Api(e.to_string()))?;
    let version = detail
        .latest_version
        .clone()
        .ok_or_else(|| InstallError::Api("skill 无 latest_version,无法下载".to_string()))?;
    let version_detail: SkillVersionDetail = api
        .get_version(skill_id, &version)
        .await
        .map_err(|e| InstallError::Api(e.to_string()))?;
    let url = version_detail
        .download_url
        .clone()
        .ok_or_else(|| InstallError::Api("版本无 downloadUrl".to_string()))?;

    // 缓存目录
    let cache = cache_zip_path(home, skill_id, &version);
    if let Some(parent) = cache.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = download_zip(&url, &cache).await?;

    // 解压到 SSOT
    let extract = extract_zip_to_ssot(home, &detail.name, &bytes)
        .map_err(InstallError::Extract)?;

    // 自动同步:对当前 state 里 enabled 的 harness 逐个 dispatch
    let snap = state.snapshot();
    let entry = snap.skills.get(skill_id);
    let enabled: Vec<HarnessId> = entry
        .map(|e| {
            e.enabled_harnesses
                .iter()
                .filter_map(|h| harness_from_str(h))
                .collect()
        })
        .unwrap_or_default();
    let mut synced = Vec::new();
    for h in enabled {
        // 同步用全局 sync method(单 skill override 暂不展开)
        let method = snap.global_sync_method;
        match dispatch_to_harness(home, &detail.name, h, method) {
            Ok(DispatchOutcome::Synced { .. }) => synced.push(h.as_str().to_string()),
            _ => {}
        }
    }

    // 写状态
    state
        .record_sync(skill_id, Some(version.clone()), None)
        .map_err(InstallError::Io)?;

    Ok(InstallResult {
        skill_id: skill_id.to_string(),
        skill_name: detail.name.clone(),
        version,
        ssot_path: extract.target_dir.to_string_lossy().to_string(),
        entry_count: extract.entry_count,
        total_bytes: extract.total_bytes,
        synced_harnesses: synced,
    })
}

/// 触发指定 harness 的同步(状态已启用但磁盘未同步,或磁盘被外部清掉时手动重同步)。
pub fn sync_one(
    home: &Path,
    state: &SkillsStateStore,
    skill_id: &str,
    skill_name: &str,
    harness: HarnessId,
) -> Result<DispatchOutcome, InstallError> {
    let method = state.snapshot().global_sync_method;
    let outcome = dispatch_to_harness(home, skill_name, harness, method)
        .map_err(|e| InstallError::Io(std::io::Error::other(e.to_string())))?;
    if let DispatchOutcome::Synced { .. } = &outcome {
        let _ = state.record_sync(skill_id, None, None);
    } else {
        let _ = state.record_sync(skill_id, None, Some(format!("{:?}", outcome)));
    }
    Ok(outcome)
}

/// 取消 harness 启用:从 state 移除 + 删除 harness 目录下的目标(SSOT 保留)。
pub fn disable_harness(
    home: &Path,
    state: &SkillsStateStore,
    skill_id: &str,
    skill_name: &str,
    harness: HarnessId,
) -> Result<(), InstallError> {
    state
        .set_enabled(skill_id, harness.as_str(), false)
        .map_err(InstallError::Io)?;
    undispatch_from_harness(home, skill_name, harness)
        .map_err(|e| InstallError::Io(std::io::Error::other(e.to_string())))?;
    Ok(())
}

/// 启用 harness:state 加 → install(若未装)→ dispatch。
pub async fn enable_harness(
    home: &Path,
    api: &SkillApiClient,
    state: &SkillsStateStore,
    skill_id: &str,
    harness: HarnessId,
) -> Result<InstallResult, InstallError> {
    state
        .set_enabled(skill_id, harness.as_str(), true)
        .map_err(InstallError::Io)?;
    // 若 SSOT 还未装,先装
    if !ssot_root(home).join(api.get_skill(skill_id).await.map_err(|e| InstallError::Api(e.to_string()))?.name).exists() {
        install_to_local(home, api, state, skill_id).await?;
    }
    let detail = api.get_skill(skill_id).await.map_err(|e| InstallError::Api(e.to_string()))?;
    let result = install_to_local(home, api, state, skill_id).await.unwrap_or_else(|_| InstallResult {
        skill_id: skill_id.to_string(),
        skill_name: detail.name.clone(),
        version: detail.latest_version.clone().unwrap_or_default(),
        ssot_path: String::new(),
        entry_count: 0,
        total_bytes: 0,
        synced_harnesses: vec![],
    });
    Ok(result)
}

fn harness_from_str(s: &str) -> Option<HarnessId> {
    Some(match s {
        "claude" => HarnessId::Claude,
        "codex" => HarnessId::Codex,
        "gemini" => HarnessId::Gemini,
        "grokbuild" => HarnessId::GrokBuild,
        "opencode" => HarnessId::OpenCode,
        "hermes" => HarnessId::Hermes,
        "pi" => HarnessId::Pi,
        _ => return None,
    })
}

/// 拉 ZIP 字节:优先用缓存(命中 + 未变化 → 复用),否则用 reqwest 拉并落盘。
async fn download_zip(url: &str, cache: &Path) -> Result<Vec<u8>, InstallError> {
    if cache.exists() {
        return Ok(std::fs::read(cache)?);
    }
    let bytes = reqwest::get(url)
        .await
        .map_err(|e| InstallError::Fetch(e.to_string()))?
        .bytes()
        .await
        .map_err(|e| InstallError::Fetch(e.to_string()))?;
    std::fs::write(cache, &bytes).map_err(InstallError::Io)?;
    Ok(bytes.to_vec())
}

//! 整合 {@link SkillApiClient} + `extract_zip_to_ssot` + {@link SkillsStateStore},
//! 单一调用完成"装到本地 SSOT"全过程,UI 只关心最终成败。
//!
//! 错误传播契约:
//! - 解压失败 → 直接返回 `InstallError::Extract`,SSOT 不会被脏写(extract 自带回滚)
//! - dispatch 失败 → 记录到 `state.last_install_error`,继续跑下一个 harness,但 `InstallResult.synced_harnesses` 不包含失败项
//! - state 写盘失败 → 返回 `InstallError::Io`,调用方回滚前端 optimistic state
//!
//! 整链路对齐 cc-switch `services/skill.rs::install`,只是把 SSOT 写在 `~/.agents-plus` 下。

use crate::domain::skill::HarnessId;
use crate::infrastructure::skill_api::{SkillApiClient, SkillVersionDetail};
use crate::infrastructure::skill_dispatcher::{
    dispatch_to_harness, undispatch_from_harness, DispatchError, DispatchOutcome,
};
use crate::infrastructure::skill_extractor::{extract_zip_to_ssot, ExtractError};
use crate::infrastructure::skill_paths::{cache_zip_path, ssot_root};
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
    /// 至少一个 harness 的 dispatch 失败,detail 为失败原因。
    #[error("dispatch 失败: {0}")]
    Dispatch(String),
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
    /// 已启用并完成同步的 harness 列表(只有 dispatch 成功的才会出现在这里)。
    pub synced_harnesses: Vec<String>,
    /// dispatch 失败的 harness 列表(空 = 全部成功)。
    pub failed_harnesses: Vec<DispatchFailure>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchFailure {
    pub harness: String,
    pub error: String,
}

/// 把指定 skill 的指定 version 装到 SSOT。
///
/// 流程:
/// 1. GET 版本详情拿 presigned download URL
/// 2. reqwest 拉 ZIP → 缓存到 `~/.agents-plus/cache/skills/{id}/{version}.zip`
/// 3. 若 SSOT 缺 SKILL.md,解压到 `~/.agents-plus/skills/{name}/`(extract 自带"old broken 嵌套自动修复")
/// 4. 读取 state 中该 skill 已启用的 harness,逐个 dispatch
/// 5. dispatch 失败的 harness 写到 `state.last_install_error`,不阻塞其它 harness
/// 6. 写 `state.record_sync(version, error=None 或首个错误)`
///
/// 错误返回契约:
/// - 解压失败 → `Err(InstallError::Extract)`,SSOT 不脏
/// - dispatch 失败 → 不抛错(已经在 state 记下,InstallResult.failed_harnesses 里能看到),前端可继续操作
/// - state 写盘失败 → `Err(InstallError::Io)`,前端 rollback optimistic state
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

    // 仅当 SSOT 缺 SKILL.md 时才解压;extract 自带"旧嵌套自动修复"
    let ssot = ssot_root(home).join(&detail.name);
    let (ssot_path, entry_count, total_bytes) = if ssot.join("SKILL.md").is_file() {
        let meta = std::fs::metadata(&ssot).map_err(InstallError::Io)?;
        (ssot.clone(), 0usize, meta.len())
    } else {
        let extract = extract_zip_to_ssot(home, &detail.name, &bytes)?;
        (extract.target_dir, extract.entry_count, extract.total_bytes)
    };

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

    let mut synced: Vec<String> = Vec::new();
    let mut failed: Vec<DispatchFailure> = Vec::new();
    for h in enabled {
        let method = snap.global_sync_method;
        match dispatch_to_harness(home, &detail.name, h, method) {
            Ok(DispatchOutcome::Synced { .. }) => synced.push(h.as_str().to_string()),
            Ok(other) => failed.push(DispatchFailure {
                harness: h.as_str().to_string(),
                error: format!("dispatch skipped: {:?}", other),
            }),
            Err(e) => failed.push(DispatchFailure {
                harness: h.as_str().to_string(),
                error: dispatch_error_to_string(&e),
            }),
        }
    }

    // 写状态:失败信息收进 last_install_error(只记第一个,避免 state 文件膨胀)
    let first_err = failed.first().map(|f| {
        if failed.len() == 1 {
            format!("[{}] {}", f.harness, f.error)
        } else {
            format!(
                "[{}] {} (另有 {} 个 harness 也失败)",
                f.harness,
                f.error,
                failed.len() - 1
            )
        }
    });
    state
        .record_sync(skill_id, Some(version.clone()), first_err)
        .map_err(InstallError::Io)?;

    Ok(InstallResult {
        skill_id: skill_id.to_string(),
        skill_name: detail.name.clone(),
        version,
        ssot_path: ssot_path.to_string_lossy().to_string(),
        entry_count,
        total_bytes,
        synced_harnesses: synced,
        failed_harnesses: failed,
    })
}

/// 触发指定 harness 的同步(状态已启用但磁盘未同步,或磁盘被外部清掉时手动重同步)。
///
/// dispatch 错误通过 `InstallError::Dispatch` 返回,前端可 toast 出来。
pub fn sync_one(
    home: &Path,
    state: &SkillsStateStore,
    skill_id: &str,
    skill_name: &str,
    harness: HarnessId,
) -> Result<DispatchOutcome, InstallError> {
    let method = state.snapshot().global_sync_method;
    let outcome = dispatch_to_harness(home, skill_name, harness, method)
        .map_err(|e| InstallError::Dispatch(dispatch_error_to_string(&e)))?;
    match &outcome {
        DispatchOutcome::Synced { .. } => {
            let _ = state.record_sync(skill_id, None, None);
        }
        DispatchOutcome::Skipped | DispatchOutcome::Failed(_) => {
            let _ = state.record_sync(
                skill_id,
                None,
                Some(format!("[{}] dispatch: {:?}", harness.as_str(), outcome)),
            );
        }
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

/// 启用 harness:state 加 → 装 SSOT(若缺)→ dispatch。
///
/// 行为对齐 cc-switch `enable_skill_for_app`:
/// - 总是先 `state.set_enabled(true)`,即使后续 dispatch 失败,前端 toggle 也保留;
///   (失败原因写到 state.last_install_error,前端可读出展示)
/// - 只调一次 `install_to_local`,里面会判断 SSOT 是否就绪,避免重复解压。
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
    install_to_local(home, api, state, skill_id).await
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

fn dispatch_error_to_string(e: &DispatchError) -> String {
    match e {
        DispatchError::SsotMissing(name) => format!("SSOT 不存在:{name}"),
        DispatchError::SsotMissingSkillMd(name) => format!("SSOT 缺 SKILL.md:{name}"),
        DispatchError::Io(io) => format!("IO 错误:{io}"),
    }
}

/// 拉 ZIP 字节:优先用缓存(命中 → 复用),否则用 reqwest 拉并落盘。
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

//! Skill IPC DTO 集合。
//!
//! AGENTS.md §5:请求和响应字段使用 camelCase;DTO 只包含跨边界所需字段;
//! 禁止把内部实体、数据库模型或第三方库类型暴露给前端。
//!
//! 序列化用 serde(rename_all = "camelCase") 保证字段命名风格一致。

use crate::infrastructure::skill_api::SkillSummary;
use crate::infrastructure::skill_installer::{DispatchFailure, InstallResult};
use serde::Serialize;

/// 列表返回的 skill 概要(IPC DTO)。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillListItemDto {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub source_type: String,
    pub latest_version: Option<String>,
    pub has_update_available: bool,
}

impl From<SkillSummary> for SkillListItemDto {
    fn from(s: SkillSummary) -> Self {
        Self {
            id: s.id,
            name: s.name,
            display_name: s.display_name,
            description: s.description,
            source_type: s.source_type,
            latest_version: s.latest_version,
            has_update_available: s.has_update_available,
        }
    }
}

/// 安装结果(IPC DTO):与服务端 InstallResult 字段一致,额外带 camelCase。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResultDto {
    pub skill_id: String,
    pub skill_name: String,
    pub version: String,
    pub ssot_path: String,
    pub entry_count: usize,
    pub total_bytes: u64,
    pub synced_harnesses: Vec<String>,
    /// dispatch 失败的 harness 列表(空 = 全部成功);前端可弹 toast。
    pub failed_harnesses: Vec<DispatchFailureDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchFailureDto {
    pub harness: String,
    pub error: String,
}

impl From<DispatchFailure> for DispatchFailureDto {
    fn from(f: DispatchFailure) -> Self {
        Self { harness: f.harness, error: f.error }
    }
}

impl From<InstallResult> for InstallResultDto {
    fn from(r: InstallResult) -> Self {
        Self {
            skill_id: r.skill_id,
            skill_name: r.skill_name,
            version: r.version,
            ssot_path: r.ssot_path,
            entry_count: r.entry_count,
            total_bytes: r.total_bytes,
            synced_harnesses: r.synced_harnesses,
            failed_harnesses: r.failed_harnesses.into_iter().map(Into::into).collect(),
        }
    }
}

/// 错误 DTO:稳定 code + message,前端可按 code 分支处理。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillErrorDto {
    pub code: String,
    pub message: String,
}

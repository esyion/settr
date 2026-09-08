//! 组织策略 IPC DTO(请求、响应)。
//!
//! 所有字段 camelCase,与前端 contracts 保持一致。

use crate::application::policy::{OrgPolicyApplyResult, PolicyFormatOutcome};
use crate::domain::document_format::DocumentFormat;
use serde::{Deserialize, Serialize};

/// apply_org_policy 请求。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOrgPolicyRequest {
    /// AGENT 型生效策略内容(写入 ~/AGENTS.md 托管区块);null 表示当前无生效策略。
    pub agent: Option<String>,
    /// CLAUDE 型生效策略内容(写入 ~/.claude/CLAUDE.md 托管区块);null 表示当前无生效策略。
    pub claude: Option<String>,
}

/// 单一文档格式的落地结果 DTO。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyFormatOutcomeDto {
    /// 目标格式。
    pub format: DocumentFormat,
    /// 是否发生磁盘写入。
    pub applied: bool,
    /// 用户可见的目标路径。
    pub display_path: String,
}

/// apply_org_policy 响应 DTO。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOrgPolicyResultDto {
    /// 每种文档格式的落地结果。
    pub outcomes: Vec<PolicyFormatOutcomeDto>,
}

impl From<PolicyFormatOutcome> for PolicyFormatOutcomeDto {
    fn from(outcome: PolicyFormatOutcome) -> Self {
        Self {
            format: outcome.format,
            applied: outcome.applied,
            display_path: outcome.display_path,
        }
    }
}

impl From<OrgPolicyApplyResult> for ApplyOrgPolicyResultDto {
    fn from(result: OrgPolicyApplyResult) -> Self {
        Self {
            outcomes: result.outcomes.into_iter().map(Into::into).collect(),
        }
    }
}

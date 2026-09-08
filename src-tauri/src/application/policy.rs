//! 组织策略落地应用层(AGENTS.md §4.3)。
//!
//! 用例:把服务端解析出的 AGENT/CLAUDE 生效策略写入本地规则文档的托管区块。
//! 校验(托管标记嵌套拒绝)在本层以下的 infrastructure 完成,本层只做编排;
//! 不依赖 Tauri 运行时,便于单测替换。

use crate::domain::document_format::DocumentFormat;
use crate::infrastructure::local_file;

/// 单一文档格式的落地结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyFormatOutcome {
    /// 目标格式。
    pub format: DocumentFormat,
    /// 是否发生磁盘写入(false 表示幂等空操作,内容未变化)。
    pub applied: bool,
    /// 用户可见的目标路径(如 ~/AGENTS.md)。
    pub display_path: String,
}

/// 组织策略落地结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrgPolicyApplyResult {
    /// 每种文档格式的落地结果。
    pub outcomes: Vec<PolicyFormatOutcome>,
}

/// 把 AGENT/CLAUDE 生效策略写入本地托管区块。
///
/// agent 策略写入 ~/AGENTS.md,claude 策略写入 ~/.claude/CLAUDE.md;
/// None/空白表示该类型当前无生效策略,会移除既有托管区块(撤回语义)。
/// 任一格式失败立即返回错误;已成功的格式保持写入状态,下次重试自然收敛。
pub fn apply_org_policies(
    agent: Option<&str>,
    claude: Option<&str>,
) -> Result<OrgPolicyApplyResult, String> {
    let mut outcomes = Vec::with_capacity(2);
    for (format, policy) in [
        (DocumentFormat::AgentsMd, agent),
        (DocumentFormat::ClaudeMd, claude),
    ] {
        let applied = local_file::apply_policy_block(format, policy)?;
        outcomes.push(PolicyFormatOutcome {
            format,
            applied,
            display_path: format.display_path(),
        });
    }
    Ok(OrgPolicyApplyResult { outcomes })
}

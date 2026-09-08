use crate::application::policy;
use crate::dto::policy::{ApplyOrgPolicyRequest, ApplyOrgPolicyResultDto};

/// Applies organization effective policies into local managed blocks.
#[tauri::command]
pub fn apply_org_policy(request: ApplyOrgPolicyRequest) -> Result<ApplyOrgPolicyResultDto, String> {
    let result = policy::apply_org_policies(request.agent.as_deref(), request.claude.as_deref())?;
    Ok(ApplyOrgPolicyResultDto::from(result))
}

import { api } from "@/lib/api-client";
import { invokeNative, isTauriRuntime } from "@/lib/tauri";

/** apply_org_policy 返回的单格式落地结果。 */
export interface OrgPolicyApplyOutcome {
  format: "agentsMd" | "claudeMd";
  applied: boolean;
  displayPath: string;
}

/** apply_org_policy 响应。 */
export interface OrgPolicyApplyResult {
  outcomes: OrgPolicyApplyOutcome[];
}

/**
 * 把组织生效策略写入本地托管区块(~/AGENTS.md、~/.claude/CLAUDE.md)。
 *
 * agent/claude 传 null 表示该类型当前无生效策略,会移除既有托管区块(撤回语义);
 * 幂等:内容未变化时 Rust 端不做磁盘写入,不会触发文件监听。
 */
export function applyOrgPolicyToNative(input: {
  agent: string | null;
  claude: string | null;
}): Promise<OrgPolicyApplyResult> {
  if (!isTauriRuntime()) {
    return Promise.reject(
      new Error(
        "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
      ),
    );
  }
  return invokeNative<OrgPolicyApplyResult>("apply_org_policy", {
    request: input,
  });
}

/**
 * policies feature API 客户端。
 */
export const policiesApi = {
  getEffectivePolicies: (orgId: string, teamId: string, projectId: string) =>
    api.getEffectivePolicies(orgId, teamId, projectId),
  listPolicyReviewRequests: (orgId: string) =>
    api.listPolicyReviewRequests(orgId),
  submitPolicyDraft: (
    orgId: string,
    input: { policyType: "AGENT" | "CLAUDE"; content: string; message: string },
  ) => api.submitPolicyDraft(orgId, input),
  reviewPolicyRequest: (orgId: string, requestId: string, decision: "APPROVED" | "REJECTED") =>
    api.reviewPolicyRequest(orgId, requestId, decision),
  listPolicyHistory: (orgId: string, policyType: string) =>
    api.listPolicyHistory(orgId, policyType as "AGENT" | "CLAUDE"),
  listPolicyDistributions: (orgId: string) =>
    api.listPolicyDistributions(orgId),
  withdrawPolicyDistribution: (orgId: string, distributionId: string) =>
    api.withdrawPolicyDistribution(orgId, distributionId),
};

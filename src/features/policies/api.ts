import { api } from "@/lib/api-client";

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
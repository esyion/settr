import type {
  EffectivePolicies,
  PolicyDistribution,
  PolicyDraft,
  PolicyReviewRequest,
  PolicyVersion,
} from "@/lib/contracts";

export type {
  EffectivePolicies,
  PolicyDistribution,
  PolicyDraft,
  PolicyReviewRequest,
  PolicyVersion,
};

/**
 * policies feature 数据中枢对外接口。
 */
export interface PoliciesDataApi {
  pendingPolicies: PolicyReviewRequest[];
  agentVersions: PolicyVersion[];
  claudeVersions: PolicyVersion[];
  distributions: PolicyDistribution[];
  effectivePolicies: EffectivePolicies | null;
  organizationId: string;
  teamId: string;
  projectId: string;
  error: string | null;
  busy: string | null;
  submitPolicyChange: (input: {
    policyType: "AGENT" | "CLAUDE";
    content: string;
    message: string;
  }) => Promise<void>;
  reviewPolicyChange: (
    requestId: string,
    decision: "APPROVED" | "REJECTED",
  ) => Promise<void>;
  withdrawDistribution: (distributionId: string) => Promise<void>;
}
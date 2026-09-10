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
  error: string | null;
  busy: string | null;
  /** 当前主体是否拥有 policy:distribute 权限(分发按钮显隐依据)。 */
  canDistributePolicy: boolean;
  submitPolicyChange: (input: {
    policyType: "AGENT" | "CLAUDE";
    content: string;
    message: string;
  }) => Promise<boolean>;
  reviewPolicyChange: (
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    comment?: string,
  ) => Promise<void>;
  withdrawDistribution: (distributionId: string) => Promise<void>;
  /** 分发 APPROVED 版本;失败抛出(对话框保持打开,toast 已提示)。 */
  distributePolicyVersion: (input: {
    versionId: string;
    scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
    teamId?: string;
    memberId?: string;
  }) => Promise<void>;
}

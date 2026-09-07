import type {
  PolicyDistribution,
  PolicyDraft,
  PolicyReviewRequest,
  PolicyVersion,
  Role,
  RoleAssignment,
  Invitation,
} from "@/lib/contracts";
import { request } from "@/lib/api-request";

/** 策略、角色、邀请 API 方法(由 api-client 合入主 api 对象)。 */
export const policyApi = {
  listInvitations: (organizationId: string) =>
    request<import("@/lib/contracts").Invitation[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/invitations"
    ),
  createInvitation: (
    organizationId: string,
    input: { email: string; roleId: string | null; teamIds: string[] }
  ) =>
    request<import("@/lib/contracts").Invitation>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/invitations",
      { method: "POST", body: input },
    ),
  revokeInvitation: (organizationId: string, invitationId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/invitations/" +
        encodeURIComponent(invitationId),
      { method: "DELETE" },
    ),
  acceptInvitation: (token: string) =>
    request<{ organizationId: string }>(
      "/api/v1/invitations/accept",
      { method: "POST", body: { token } },
    ),
  withdrawPolicyDistribution: (
    organizationId: string,
    distributionId: string,
  ) =>
    request<import("@/lib/contracts").PolicyDistribution>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions/" +
        encodeURIComponent(distributionId),
      { method: "DELETE" },
    ),
  listPolicyDistributions: (organizationId: string) =>
    request<import("@/lib/contracts").PolicyDistribution[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions",
    ),
  assignRole: (
    organizationId: string,
    input: {
      organizationMemberId: string;
      roleId: string;
      teamId?: string;
      projectId?: string;
    },
  ) =>
    request<import("@/lib/contracts").Role>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/roles",
      { method: "POST", body: input },
    ),
  submitPolicyDraft: (
    organizationId: string,
    input: { policyType: "AGENT" | "CLAUDE"; content: string; message: string },
  ) =>
    request<import("@/lib/contracts").PolicyDraft>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes",
      { method: "POST", body: input },
    ),
  listPolicyReviewRequests: (organizationId: string) =>
    request<import("@/lib/contracts").PolicyReviewRequest[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes/pending",
    ),
  distributePolicy: (
    organizationId: string,
    input: {
      versionId: string;
      scopeType: string;
      teamId?: string;
      projectId?: string;
      memberId?: string;
    },
  ) =>
    request<import("@/lib/contracts").PolicyDistribution>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions",
      { method: "POST", body: input },
    ),
  reviewPolicyRequest: (
    organizationId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    comment?: string,
  ) =>
    request<import("@/lib/contracts").PolicyDraft>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes/" +
        encodeURIComponent(requestId) +
        "/review",
      { method: "POST", body: { decision, comment } },
    ),
  listPolicyHistory: (organizationId: string, policyType: "AGENT" | "CLAUDE") =>
    request<import("@/lib/contracts").PolicyVersion[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/history?policyType=" +
        policyType,
    ),
};
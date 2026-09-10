import { api } from "@/lib/api-client";

/**
 * memberships feature API 客户端：对 /organizations/{orgId}/members 与
 * /teams/{teamId}/members 的薄封装。
 */
export const membershipsApi = {
  listMemberships: (orgId: string) => api.listMemberships(orgId),
  enableMembership: (orgId: string, memberId: string) =>
    api.enableMembership(orgId, memberId),
  disableMembership: (orgId: string, memberId: string) =>
    api.disableMembership(orgId, memberId),
  removeMembership: (orgId: string, memberId: string) =>
    api.removeMembership(orgId, memberId),
  listTeamMemberships: (teamId: string) => api.listTeamMemberships(teamId),
  listTeamMembers: (teamId: string) => api.listTeamMembers(teamId),
  addTeamMembership: (teamId: string, organizationMemberId: string) =>
    api.addTeamMembership(teamId, organizationMemberId),
  enableTeamMembership: (teamId: string, memberId: string) =>
    api.enableTeamMembership(teamId, memberId),
  disableTeamMembership: (teamId: string, memberId: string) =>
    api.disableTeamMembership(teamId, memberId),
  removeTeamMembership: (teamId: string, memberId: string) =>
    api.removeTeamMembership(teamId, memberId),
  // 邀请相关：分两组 API，组织内管理与公开接受
  listInvitations: (orgId: string) => api.listInvitations(orgId),
  createInvitation: (
    orgId: string,
    input: { email: string; roleId: string | null; teamIds: string[] },
  ) => api.createInvitation(orgId, input),
  revokeInvitation: (orgId: string, invitationId: string) =>
    api.revokeInvitation(orgId, invitationId),
  acceptInvitation: (token: string) => api.acceptInvitation(token),
};
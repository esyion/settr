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
  addTeamMembership: (teamId: string, organizationMemberId: string) =>
    api.addTeamMembership(teamId, organizationMemberId),
  enableTeamMembership: (teamId: string, memberId: string) =>
    api.enableTeamMembership(teamId, memberId),
  disableTeamMembership: (teamId: string, memberId: string) =>
    api.disableTeamMembership(teamId, memberId),
  removeTeamMembership: (teamId: string, memberId: string) =>
    api.removeTeamMembership(teamId, memberId),
};
import { request } from "@/lib/api-request";

/** 组织、团队、项目、成员、邀请、策略、角色 API 方法(由 api-client 合入主 api 对象)。 */
export const organizationApi = {
  listOrganizations: () =>
    request<import("@/lib/contracts").Organization[]>("/api/v1/organizations"),
  listMyOrganizations: () =>
    request<import("@/lib/contracts").Organization[]>("/api/v1/organizations"),
  createOrganization: (name: string) =>
    request<import("@/lib/contracts").Organization>("/api/v1/organizations", {
      method: "POST",
      body: { name },
    }),
  createTeam: (organizationId: string, name: string) =>
    request<import("@/lib/contracts").Team>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/teams",
      { method: "POST", body: { name } },
    ),
  createProject: (organizationId: string, teamId: string, name: string) =>
    request<import("@/lib/contracts").Project>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects",
      { method: "POST", body: { name } },
    ),
  enableMembership: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/enable",
      { method: "POST" },
    ),
  disableMembership: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/disable",
      { method: "POST" },
    ),
  removeMembership: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId),
      { method: "DELETE" },
    ),
  enableTeamMembership: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/enable",
      { method: "POST" },
    ),
  disableTeamMembership: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/disable",
      { method: "POST" },
    ),
  addMembership: (organizationId: string, userId: string) =>
    request<import("@/lib/contracts").Membership>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members",
      { method: "POST", body: { userId } },
    ),
  listTeams: (organizationId: string) =>
    request<import("@/lib/contracts").Team[]>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/teams",
    ),
  listTeamMemberships: (teamId: string) =>
    request<import("@/lib/contracts").TeamMembership[]>(
      "/api/v1/teams/" + encodeURIComponent(teamId) + "/members",
    ),
  addTeamMembership: (teamId: string, organizationMemberId: string) =>
    request<import("@/lib/contracts").TeamMembership>(
      "/api/v1/teams/" + encodeURIComponent(teamId) + "/members",
      { method: "POST", body: { organizationMemberId } },
    ),
  removeTeamMembership: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId),
      { method: "DELETE" },
    ),
  listProjects: (organizationId: string, teamId: string) =>
    request<import("@/lib/contracts").Project[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects",
    ),
  listMemberships: (organizationId: string) =>
    request<import("@/lib/contracts").Membership[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members",
    ),
  /** 获取当前成员的生效规范(服务端聚合,不传团队参数——规格 §6.5)。 */
  getEffectivePolicies: (organizationId: string) =>
    request<import("@/lib/contracts").EffectivePolicies>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/effective",
    ),
  listRoles: (organizationId: string) =>
    request<import("@/lib/contracts").Role[]>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/roles",
    ),
  listRoleAssignments: (organizationId: string) =>
    request<import("@/lib/contracts").RoleAssignment[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/roles/assignments",
    ),
  revokeRoleAssignment: (assignmentId: string) =>
    request<void>(
      "/api/v1/role-assignments/" + encodeURIComponent(assignmentId),
      { method: "DELETE" },
    ),

  deleteOrganization: (organizationId: string) =>
    request<void>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId),
      { method: "DELETE" },
    ),
  renameOrganization: (organizationId: string, name: string) =>
    request<import("@/lib/contracts").Organization>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId),
      { method: "PATCH", body: { name } },
    ),
  deleteTeam: (organizationId: string, teamId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId),
      { method: "DELETE" },
    ),
  renameTeam: (organizationId: string, teamId: string, name: string) =>
    request<import("@/lib/contracts").Team>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId),
      { method: "PATCH", body: { name } },
    ),
  deleteProject: (organizationId: string, teamId: string, projectId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects/" +
        encodeURIComponent(projectId),
      { method: "DELETE" },
    ),

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

  renameProject: (
    organizationId: string,
    teamId: string,
    projectId: string,
    name: string,
  ) =>
    request<import("@/lib/contracts").Project>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects/" +
        encodeURIComponent(projectId),
      { method: "PATCH", body: { name } },
    ),
};

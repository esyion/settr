import { api } from "@/lib/api-client";

/**
 * roles feature API 客户端。
 */
export const rolesApi = {
  listRoles: (orgId: string) => api.listRoles(orgId),
  listRoleAssignments: (orgId: string) => api.listRoleAssignments(orgId),
  assignRole: (
    orgId: string,
    input: { organizationMemberId: string; roleId: string },
  ) => api.assignRole(orgId, input),
  revokeRoleAssignment: (assignmentId: string) =>
    api.revokeRoleAssignment(assignmentId),
};
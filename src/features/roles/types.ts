import type { Role, RoleAssignment } from "@/lib/contracts";

export type { Role, RoleAssignment };

/**
 * roles feature 数据中枢对外接口。
 */
export interface RolesDataApi {
  roles: Role[];
  roleAssignments: RoleAssignment[];
  organizationId: string;
  error: string | null;
  busy: string | null;
  refresh: () => Promise<void>;
  assignRole: (input: {
    organizationMemberId: string;
    roleId: string;
  }) => Promise<void>;
  revokeRoleAssignment: (assignmentId: string) => Promise<void>;
}
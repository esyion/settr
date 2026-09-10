import type {
  Invitation,
  Membership,
  MembershipStatusValue,
  TeamMemberView,
  TeamMembership,
} from "@/lib/contracts";

export type { Invitation, Membership, TeamMemberView, TeamMembership };

// 重新暴露 membership 状态常量与类型,让 features 内部组件能就近导入。
export {
  MEMBERSHIP_STATUS,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusLabel,
} from "@/lib/contracts";
export type { MembershipStatusValue };

/**
 * memberships feature 数据中枢对外接口。
 */
export interface MembershipsDataApi {
  memberships: Membership[];
  teamMemberships: TeamMemberView[];
  organizationId: string;
  teamId: string;
  error: string | null;
  busy: string | null;
  refresh: () => Promise<void>;
  enableMembership: (id: string) => Promise<void>;
  disableMembership: (id: string) => Promise<void>;
  removeMembership: (id: string) => Promise<void>;
  addTeamMembership: (organizationMemberId: string) => Promise<void>;
  enableTeamMembership: (id: string) => Promise<void>;
  disableTeamMembership: (id: string) => Promise<void>;
  removeTeamMembership: (id: string) => Promise<void>;
}

import type {
  Invitation,
  Membership,
  TeamMemberView,
  TeamMembership,
} from "@/lib/contracts";

export type { Invitation, Membership, TeamMemberView, TeamMembership };

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
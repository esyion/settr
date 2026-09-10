"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { OrganizationMembers } from "@/features/memberships/components/organization-members";
import { TeamMembers } from "@/features/memberships/components/team-members";
import { PendingInvitations } from "@/features/memberships/components/pending-invitations";
import { InviteModal } from "@/features/memberships/components/invite-modal";
import { useMembershipsData } from "@/features/memberships";
import { useTeamsData } from "@/features/teams";

/**
 * 成员管理页:组织成员 + 团队成员 + 待处理邀请 + 邀请入口。
 */
export default function MembershipsPage() {
  const teams = useTeamsData();
  const data = useMembershipsData(teams.teamId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="成员"
        description="通过邀请添加组织成员，或维护现有成员状态。"
        actions={
          <InviteModal>
            <Button>
              <Mail />
              邀请成员
            </Button>
          </InviteModal>
        }
      />
      <PendingInvitations />
      <OrganizationMembers data={data} />
      <TeamMembers data={data} />
    </div>
  );
}

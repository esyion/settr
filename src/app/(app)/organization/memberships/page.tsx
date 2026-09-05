"use client";

import { PageHeader } from "@/components/page-header";
import { OrganizationMembers } from "@/features/memberships/components/organization-members";
import { TeamMembers } from "@/features/memberships/components/team-members";
import { useMembershipsData } from "@/features/memberships";

/**
 * 成员管理页。
 */
export default function MembershipsPage() {
  const data = useMembershipsData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="成员"
        description="管理组织成员与团队成员。"
      />
      <OrganizationMembers data={data} />
      <TeamMembers data={data} />
    </div>
  );
}
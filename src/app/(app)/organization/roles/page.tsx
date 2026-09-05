"use client";

import { PageHeader } from "@/components/page-header";
import { AssignRoleCard } from "@/features/roles/components/assign-role";
import { AssignmentsCard } from "@/features/roles/components/assignments-list";
import { useRolesData } from "@/features/roles";

/**
 * 角色管理页。
 */
export default function RolesPage() {
  const data = useRolesData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="角色与授权"
        description="把组织成员绑定到角色,实现 RBAC。"
      />
      <AssignRoleCard data={data} />
      <AssignmentsCard data={data} />
    </div>
  );
}
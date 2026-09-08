"use client";

import { PageHeader } from "@/components/page-header";
import { SkillList } from "@/features/skills/components/skill-list";
import { useOrgSkills } from "@/features/skills/hooks/use-org-skills";
import { useWorkspaceStore } from "@/features/context/store";

/**
 * 组织空间 skill 管理页:数据源为组织可见 skill(GET /skills?scope=org),
 * 创建/导入/发布与个人态共用组件,归属自动绑定当前组织(Task 13/14 接入)。
 */
export default function OrganizationSkillsPage() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const org = useOrgSkills(organizationId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="Skills"
        description="组织空间的 skill 资产管理与分发。"
      />
      {org.error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{org.error}</p>
          <button className="text-sm underline" onClick={() => void org.refresh()}>
            重试
          </button>
        </div>
      ) : (
        <SkillList items={org.skills} onRefreshOverride={org.refresh} />
      )}
    </div>
  );
}

"use client";

import { PageHeader } from "@/components/page-header";
import { OrganizationSelector } from "@/features/teams/components/organization-selector";
import { TeamCard } from "@/features/teams/components/team-card";
import { ProjectCard } from "@/features/teams/components/project-card";
import { useTeamsData } from "@/features/teams";

/**
 * 团队与项目管理页：组织空间的默认首页。
 *
 * 创建组织的入口已迁到 WorkspaceSwitcher 顶部菜单中的「创建新组织」，
 * 本页不再承担该职责，避免重复入口。
 */
export default function TeamsPage() {
  const data = useTeamsData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="团队与项目"
        description="管理组织下的团队和项目层级。"
      />
      <OrganizationSelector data={data} />
      <TeamCard data={data} />
      {data.teamId && <ProjectCard data={data} />}
    </div>
  );
}
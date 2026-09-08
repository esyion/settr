"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import type { DistributeSubmitInput } from "@/components/distribute-dialog";
import { SkillList } from "@/features/skills/components/skill-list";
import { SkillDistributeDialog } from "@/features/skills/components/skill-distribute-dialog";
import { OrgDistributionCard } from "@/features/skills/components/org-distribution-card";
import { useOrgSkills } from "@/features/skills/hooks/use-org-skills";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";

/**
 * 组织空间 skill 管理页:数据源为组织可见 skill(GET /skills?scope=ORG),
 * 创建/导入/发布与个人态共用组件(归属自动绑定当前组织);
 * 顶部为组织分发记录卡片,行内"分发"入口按 skill:distribute 权限显隐(规格 §6.2/§6.3)。
 */
export default function OrganizationSkillsPage() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  // 权限显隐在 selector 内从 myPermissions 计算(org 级或任一 team 级命中),
  // 保证权限落地时触发重渲染;目标级权限由后端逐请求裁决。
  const canDistribute = useWorkspaceStore((s) => {
    const my = s.myPermissions;
    if (!my) return false;
    return (
      my.orgLevel.includes("skill:distribute") ||
      my.teamLevel.some((t) => t.permissions.includes("skill:distribute"))
    );
  });
  const org = useOrgSkills(organizationId);
  const [distributeTarget, setDistributeTarget] = useState<Skill | null>(null);
  const [distributing, setDistributing] = useState(false);

  /**
   * 分发提交:成功后关闭对话框并刷新列表;失败保持打开(toast 提示)。
   */
  const handleDistributeSubmit = async (input: DistributeSubmitInput) => {
    if (!organizationId || !distributeTarget) return;
    setDistributing(true);
    try {
      await api.distributeSkill(organizationId, {
        skillId: distributeTarget.id,
        scopeType: input.scopeType,
        teamId: input.teamId,
        memberId: input.memberId,
      });
      toast.success("已分发");
      setDistributeTarget(null);
      void org.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "分发失败");
    } finally {
      setDistributing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="Skills"
        description="组织空间的 skill 资产管理与分发。"
      />
      {organizationId && (
        <OrgDistributionCard orgId={organizationId} canWithdraw={canDistribute} />
      )}
      {org.error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{org.error}</p>
          <button className="text-sm underline" onClick={() => void org.refresh()}>
            重试
          </button>
        </div>
      ) : (
        <SkillList
          items={org.skills}
          loading={org.loading}
          onRefreshOverride={org.refresh}
          onDistribute={canDistribute ? setDistributeTarget : undefined}
        />
      )}
      <SkillDistributeDialog
        open={distributeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDistributeTarget(null);
        }}
        organizationId={organizationId ?? ""}
        skillName={distributeTarget?.displayName || distributeTarget?.name || null}
        busy={distributing}
        onSubmit={handleDistributeSubmit}
      />
    </div>
  );
}

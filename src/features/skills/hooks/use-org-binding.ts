"use client";

import { useWorkspaceStore } from "@/features/context/store";
import type { SkillOrgBinding } from "@/lib/api-skill";

/**
 * 读取当前工作区状态,产出创建/导入请求的组织归属绑定:
 * 组织态返回 { ownerScope: "ORG", orgId },个人态返回 undefined(后端缺省 PERSONAL)。
 * 无空间选择器——归属自动等于当前组织(规格 §6.2/D2)。
 */
export function useOrgBinding(): SkillOrgBinding | undefined {
  const scope = useWorkspaceStore((s) => s.scope);
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  if (scope !== "organization" || !organizationId) return undefined;
  return { ownerScope: "ORG", orgId: organizationId };
}

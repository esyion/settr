"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Organization } from "@/lib/contracts";

/**
 * 工作区上下文作用域：用户当前激活的是个人空间还是某个组织。
 */
export type WorkspaceScope = "personal" | "organization";

/**
 * 工作区上下文全局状态：
 * <ul>
 *   <li>scope 决定侧边栏与数据源是个人还是组织；</li>
 *   <li>organizationId / organizationName 同步当前激活组织；</li>
 *   <li>organizations 缓存用户所属组织列表，避免每次切回都重新拉取；</li>
 *   <li>setOrganizations 会校验当前 organizationId 是否仍合法，无效则降级回 personal。</li>
 * </ul>
 */
interface WorkspaceState {
  scope: WorkspaceScope;
  organizationId: string | null;
  organizationName: string | null;
  organizations: Organization[];

  setOrganizations: (orgs: Organization[]) => void;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  reset: () => void;
}

/**
 * 默认状态：登录后未选组织前保持个人空间。
 */
const initialState = {
  scope: "personal" as WorkspaceScope,
  organizationId: null as string | null,
  organizationName: null as string | null,
  organizations: [] as Organization[],
};

/**
 * 跨 feature 共享的工作区上下文 store，使用 sessionStorage 持久化，
 * 避免页面刷新后丢失用户上次的组织选择。
 */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setOrganizations: (orgs) => {
        const currentId = get().organizationId;
        const matched = currentId
          ? orgs.find((org) => org.id === currentId) ?? null
          : null;
        set({
          organizations: orgs,
          organizationId: matched ? matched.id : null,
          organizationName: matched ? matched.name : null,
          scope: matched ? "organization" : "personal",
        });
      },

      setOrganization: (id) => {
        const org = get().organizations.find((item) => item.id === id);
        if (!org) return;
        set({
          organizationId: org.id,
          organizationName: org.name,
          scope: "organization",
        });
      },

      clearOrganization: () => {
        set({
          organizationId: null,
          organizationName: null,
          scope: "personal",
        });
      },

      reset: () => {
        set({ ...initialState });
      },
    }),
    {
      name: "agents-plus-workspace-context",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        scope: state.scope,
        organizationId: state.organizationId,
        organizationName: state.organizationName,
      }),
    },
  ),
);
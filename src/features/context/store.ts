"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api, ApiClientError } from "@/lib/api-client";
import type { Organization } from "@/lib/contracts";

/**
 * 工作区上下文作用域：用户当前激活的是个人空间还是某个组织。
 */
export type WorkspaceScope = "personal" | "organization";

/**
 * 把任意错误归一化为可向用户展示的中文提示。
 */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * 工作区上下文全局状态：
 * <ul>
 *   <li>scope 决定侧边栏与数据源是个人还是组织；</li>
 *   <li>organizationId / organizationName 同步当前激活组织；</li>
 *   <li>organizations 缓存用户所属组织列表，避免每次切回都重新拉取；</li>
 *   <li>loading / error 是 refresh 的请求态，供组织子路由守卫与切换器禁用触发器；</li>
 *   <li>setOrganizations 会校验当前 organizationId 是否仍合法，无效则降级回 personal。</li>
 * </ul>
 */
interface WorkspaceState {
  scope: WorkspaceScope;
  organizationId: string | null;
  organizationName: string | null;
  organizations: Organization[];
  loading: boolean;
  error: string | null;

  setOrganizations: (orgs: Organization[]) => void;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  /** 拉取最新组织列表并复校当前选择；任何组件均可通过 store 直接触发，无需经过 Context。 */
  refresh: () => Promise<void>;
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
  loading: false,
  error: null as string | null,
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

      refresh: async () => {
        set({ loading: true, error: null });
        try {
          const orgs = await api.listMyOrganizations();
          get().setOrganizations(orgs);
        } catch (caught) {
          set({ error: readableError(caught, "加载组织列表失败") });
        } finally {
          set({ loading: false });
        }
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
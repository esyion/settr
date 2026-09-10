"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api, ApiClientError } from "@/lib/api-client";
import { listMyPermissions, type MyPermissions } from "@/lib/api-permission";
import type { Organization } from "@/lib/contracts";

/**
 * 工作区上下文作用域:用户当前激活的是个人空间还是某个组织。
 * 注意:这是纯 UI 导航态,与服务端枚举 SkillOwnerScope(PERSONAL/ORG)是
 * 两个概念,勿将其值直接作为 API 请求参数;线上取值只在 lib/api-*.ts 收口。
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
 *   <li>myPermissions 缓存当前组织的权限码汇总(切换组织时重拉,R4 不做推送失效),
 *       hasPermission 是分发/管理按钮显隐的唯一判定入口;数据缺失按无权限处理(宁少勿多);</li>
 *   <li>loading / error 是 refresh 的请求态，供组织子路由守卫与切换器禁用触发器；</li>
 *   <li>setOrganizations 会校验当前 organizationId 是否仍合法，无效则降级回 personal。</li>
 * </ul>
 */
interface WorkspaceState {
  scope: WorkspaceScope;
  organizationId: string | null;
  organizationName: string | null;
  organizations: Organization[];
  myPermissions: MyPermissions | null;
  loading: boolean;
  error: string | null;

  setOrganizations: (orgs: Organization[]) => void;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  /**
   * 当前用户主动退出指定组织。
   * <p>
   * 调用后端 /leave：成功后从 organizations 中剔除该组织，若被剔除的正是当前
   * 激活组织则降级到个人空间；失败抛出错误由调用方决定提示。
   */
  leaveOrganization: (id: string) => Promise<void>;
  /** 拉取当前组织的权限码汇总;仍停留在该组织时才写入,失败降级为 null。 */
  refreshMyPermissions: (orgId: string) => Promise<void>;
  /** 判定当前工作区是否拥有指定权限码(org 级命中,或 teamId 对应的团队级命中)。 */
  hasPermission: (code: string, teamId?: string) => boolean;
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
  myPermissions: null as MyPermissions | null,
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
          ? (orgs.find((org) => org.id === currentId) ?? null)
          : null;
        set({
          organizations: orgs,
          organizationId: matched ? matched.id : null,
          organizationName: matched ? matched.name : null,
          scope: matched ? "organization" : "personal",
          myPermissions: matched ? get().myPermissions : null,
        });
        // 复校仍命中当前组织(含刷新页面后的首次同步)时刷新权限汇总
        if (matched) {
          void get().refreshMyPermissions(matched.id);
        }
      },

      setOrganization: (id) => {
        const org = get().organizations.find((item) => item.id === id);
        if (!org) return;
        set({
          organizationId: org.id,
          organizationName: org.name,
          scope: "organization",
          // 先清空,避免切换窗口期沿用上一组织的权限判定(宁少勿多)
          myPermissions: null,
        });
        // 切换组织即重拉权限(R4:不做推送失效,不做页面级重拉)
        void get().refreshMyPermissions(org.id);
      },

      clearOrganization: () => {
        set({
          organizationId: null,
          organizationName: null,
          scope: "personal",
          myPermissions: null,
        });
      },

      leaveOrganization: async (id) => {
        try {
          await api.leaveOrganization(id);
        } catch (caught) {
          set({ error: readableError(caught, "退出组织失败") });
          throw caught;
        }
        // 成功：从列表剔除；若正好是当前激活组织则回到个人空间
        const state = get();
        const remaining = state.organizations.filter((o) => o.id !== id);
        if (state.organizationId === id) {
          set({
            organizations: remaining,
            organizationId: null,
            organizationName: null,
            scope: "personal",
            myPermissions: null,
          });
        } else {
          set({ organizations: remaining });
        }
      },

      refreshMyPermissions: async (orgId) => {
        try {
          const my = await listMyPermissions(orgId);
          // 仅当仍停留在该组织时写入,防止切换竞态写入过期权限
          if (get().organizationId === orgId) set({ myPermissions: my });
        } catch {
          // 失败按无权限处理(按钮隐藏而非禁用,宁少勿多),不阻塞组织切换;
          // 同样带组织守卫,避免慢失败的旧请求清掉新组织的权限
          if (get().organizationId === orgId) set({ myPermissions: null });
        }
      },

      hasPermission: (code, teamId) => {
        const my = get().myPermissions;
        if (!my) return false;
        if (my.orgLevel.includes(code)) return true;
        if (teamId) {
          return my.teamLevel.some(
            (t) => t.teamId === teamId && t.permissions.includes(code),
          );
        }
        return false;
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

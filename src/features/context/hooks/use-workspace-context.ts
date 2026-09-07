"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";

/**
 * 工作区上下文对外暴露的能力：scope/当前组织/loading/error + 切换 + 刷新。
 */
export interface WorkspaceContextApi {
  scope: "personal" | "organization";
  organizationId: string | null;
  organizationName: string | null;
  organizations: Array<{ id: string; name: string; ownerUserId: string }>;
  loading: boolean;
  error: string | null;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  refresh: () => Promise<void>;
}

/**
 * 把任意错误归一化为可向用户展示的中文提示。
 */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * 工作区上下文数据加载 hook：必须在 (app)/layout.tsx 内挂载一次，
 * 之后通过 features/context/workspace-context 的 Provider 共享给子组件。
 * 任何在子组件重复调用都会触发重复的 listMyOrganizations 请求。
 */
export function useWorkspaceContext(): WorkspaceContextApi {
  const scope = useWorkspaceStore((s) => s.scope);
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const organizationName = useWorkspaceStore((s) => s.organizationName);
  const organizations = useWorkspaceStore((s) => s.organizations);
  const setOrganizations = useWorkspaceStore((s) => s.setOrganizations);
  const setOrganization = useWorkspaceStore((s) => s.setOrganization);
  const clearOrganization = useWorkspaceStore((s) => s.clearOrganization);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await api.listMyOrganizations();
      setOrganizations(orgs);
    } catch (caught) {
      setError(readableError(caught, "加载组织列表失败"));
    } finally {
      setLoading(false);
    }
  }, [setOrganizations]);

  // 首次挂载时拉取用户所属组织列表；与 zustand store 同步副作用属于外部系统同步。
  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  return {
    scope,
    organizationId,
    organizationName,
    organizations,
    loading,
    error,
    setOrganization,
    clearOrganization,
    refresh,
  };
}
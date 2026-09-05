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
 * 工作区上下文 hook：在 (app) 布局首次挂载时拉取用户所属组织列表，
 * 之后由 zustand store 持有与切换。
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
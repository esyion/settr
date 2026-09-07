"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/features/context/store";

/**
 * 工作区上下文引导 hook：仅在 (app)/layout.tsx 挂载一次，
 * 首次进入应用时拉取用户所属组织列表并写入 useWorkspaceStore。
 * 子组件一律直接读 useWorkspaceStore，禁止在子组件重复调用本 hook，
 * 否则会触发重复的 listMyOrganizations 请求。
 */
export function useWorkspaceBootstrap(): void {
  const refresh = useWorkspaceStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);
}
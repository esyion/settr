"use client";

import { createContext, useContext } from "react";
import type { WorkspaceContextApi } from "@/features/context/hooks/use-workspace-context";

/**
 * 工作区上下文 React Context：在 (app) 布局初始化一次，
 * 子组件（侧边栏、组织空间 layout 等）通过 useWorkspaceContext()
 * 消费，避免每个组件各自触发 listMyOrganizations 请求。
 */
export const WorkspaceContext = createContext<WorkspaceContextApi | null>(null);

/**
 * 消费工作区上下文的 hook；找不到 Provider 时抛错提示接入错误。
 */
export function useWorkspaceContextValue(): WorkspaceContextApi {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceContextValue must be used inside (app)/layout.tsx WorkspaceContext.Provider",
    );
  }
  return ctx;
}
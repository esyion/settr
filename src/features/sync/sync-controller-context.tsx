"use client";

import { createContext, useContext } from "react";
import type { DocumentFormat, Revision } from "@/lib/contracts";

/** 同步控制器对外暴露的 API 形状，由 (app)/layout 在 Provider 中填充。 */
export interface SyncControllerApi {
  state: import("@/lib/contracts").SyncState;
  busy: string | null;
  notice: string | null;
  mergeDraft: string | null;
  setMergeDraft: (value: string | null) => void;
  refresh: () => Promise<void>;
  selectFormat: (format: DocumentFormat) => Promise<void>;
  loginCompleted: () => Promise<void>;
  upload: (message: string) => Promise<void>;
  apply: (revision?: Revision | null) => Promise<void>;
  startMerge: () => void;
  resolveMerge: () => Promise<void>;
  logout: () => Promise<void>;
  restore: (revisionId: string) => Promise<void>;
  rename: (deviceId: string, name: string) => Promise<void>;
  revoke: (deviceId: string) => Promise<void>;
  desktop: boolean;
}

const SyncControllerContext = createContext<SyncControllerApi | null>(null);

/**
 * 在 (app) 路由组中初始化一次同步控制器，并通过 context 暴露给所有子页面消费。
 * 这样可以避免每个页面重复挂载心跳、本地文件监听和全局刷新副作用。
 */
export function SyncControllerProvider({
  value,
  children,
}: {
  value: SyncControllerApi;
  children: React.ReactNode;
}) {
  return (
    <SyncControllerContext.Provider value={value}>
      {children}
    </SyncControllerContext.Provider>
  );
}

/**
 * 由 (app) 下的页面读取同步状态与操作；必须在 SyncControllerProvider 内部调用。
 */
export function useSyncController(): SyncControllerApi {
  const context = useContext(SyncControllerContext);
  if (!context) {
    throw new Error(
      "useSyncController 必须在 (app) 路由布局下的 SyncControllerProvider 内部调用",
    );
  }
  return context;
}

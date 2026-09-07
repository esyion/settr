"use client";

import { type ReactNode, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { setupFrontendLogging } from "@/lib/frontend-logger";

/**
 * 应用级客户端 Providers。
 * <p>
 * 静态导出模式下，仅浏览器可用的初始化逻辑集中挂载于此，
 * 避免散落在各页面组件中；当前负责前端日志转发安装。
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    setupFrontendLogging();
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

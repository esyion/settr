"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * 主题 Provider(基于 next-themes)。
 * <p>
 * 以 class 方式挂载主题,支持 system 跟随系统;透传 props 便于统一调整默认值。
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

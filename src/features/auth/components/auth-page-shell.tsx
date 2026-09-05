"use client";

import type { ReactNode } from "react";

/**
 * 鉴权路由组的页头壳：eyebrow + 主标题 + 可选描述 + 内容插槽。
 * <p>
 * 用于 /login、/register、/forgot-password、/reset-password 共用的标题区，
 * 避免每个页面重复相同的文案层级和样式。
 */
export function AuthPageShell({
  eyebrow,
  title,
  caption,
  children,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
        {caption && (
          <p className="mt-2 text-sm text-muted-foreground">{caption}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * 非 Tauri 桌面环境时的提示卡片，让浏览器预览用户明确知道要回到桌面客户端。
 */
export function DesktopRequiredNotice({
  action = "登录",
}: {
  action?: string;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        请使用 Agents Plus 桌面应用
      </h2>
      <p>
        浏览器预览页不会访问本机文件系统或系统凭据存储。请运行{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          npm run tauri dev
        </code>{" "}
        启动桌面客户端后再{action}。
      </p>
    </div>
  );
}

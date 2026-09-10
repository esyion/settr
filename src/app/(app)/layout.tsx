"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, RefreshCw } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/features/app/components/app-sidebar";
import { StatusBadge } from "@/components/status-badge";
import { PendingUpdatesBadge } from "@/features/skills/components/pending-updates-badge";
import {
  SyncControllerProvider,
  useSyncController,
} from "@/features/sync/sync-controller-context";
import { useSyncController as useSyncControllerInstance } from "@/features/sync/use-sync-controller";
import { useWorkspaceBootstrap } from "@/features/context/hooks/use-workspace-context";
import { useOrgPolicySync } from "@/features/policies/hooks/use-org-policy-sync";
import { usePushEvents } from "@/features/policies/hooks/use-push-events";

const PAGE_META: Record<string, string> = {
  "/overview": "概览",
  "/versions": "版本历史",
  "/skills": "Skills",
  "/devices": "设备",
  "/organization": "组织",
  "/settings": "设置",
};

/**
 * 已登录应用的路由组布局：
 * <ul>
 *   <li>挂载一次同步控制器（心跳 / 本地文件监听 / 全局刷新），通过 Context 暴露给所有子页面；</li>
 *   <li>渲染 shadcn Sidebar + 顶部栏 + 面包屑，统一顶部状态徽标和退出登录入口；</li>
 *   <li>未登录或非 Tauri 环境时拦截跳转，避免子页面再次重复处理登录态。</li>
 * </ul>
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 首次进入应用时拉取组织列表写入 useWorkspaceStore；子组件直接读 store，无需 Provider。
  useWorkspaceBootstrap();
  // 激活组织期间把生效 AGENT/CLAUDE 策略物化到本地托管区块，切回个人时清除。
  useOrgPolicySync();
  // 组织推送连接生命周期：服务端分发/撤回信号 → push-bus → 各数据中枢刷新。
  usePushEvents();
  return (
      <SyncControllerProvider value={useSyncControllerInstance()}>
        <AppLayoutShell>{children}</AppLayoutShell>
      </SyncControllerProvider>
  );
}

/** 实际渲染的壳：先做权限 / 环境检查，再渲染侧边栏 + 顶部栏。 */
function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const controller = useSyncController();
  const pathname = usePathname();
  // 服务端没有 `window`，`isTauriRuntime()` 在 SSR 与首次 hydration 时取值不同，
  // 会让不同分支渲染出不同 DOM（卡片 vs spinner）。先把 SSR 与 hydration 锁在
  // 同一个 loading 占位上，挂载后再按真实环境分支。
  const [mounted, setMounted] = useState(false);

  // mounted 仅在挂载后变 true;用 setTimeout(0) 把它推到下一个宏任务,避开 effect 内同步 setState。
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // 鉴权拦截：未登录且已读取到设备身份时跳到登录页。
  useEffect(() => {
    if (!controller.desktop) return;
    if (
      controller.state.status === "signedOut" &&
      controller.state.identity !== null &&
      pathname !== "/login"
    ) {
      router.replace("/login");
    }
  }, [
    controller.desktop,
    controller.state.status,
    controller.state.identity,
    pathname,
    router,
  ]);

  if (!mounted) {
    return <LoadingNotice />;
  }

  if (!controller.desktop) {
    return <DesktopRequiredNotice />;
  }

  const isLoadingIdentity =
    controller.state.status === "loading" && !controller.state.identity;
  if (isLoadingIdentity) {
    return <LoadingNotice />;
  }

  // 已登录用户遇到瞬时错误(后端 5xx / 网络抖动 / 离线):保留 shell 与侧边栏,
  // 在顶部内嵌一条横幅给出原因与重试入口,避免一次失败把整壳替换为「无法恢复登录状态」。
  // 仅当用户尚未登录(status === "signedOut" 且无 user)时才退化为全屏引导。
  if (controller.state.status === "signedOut") {
    return (
      <StartupNotice
        message={controller.state.message || "请登录后继续"}
        onRetry={async () => {
          await controller.refresh();
        }}
      />
    );
  }

  if (!controller.state.user) {
    return (
      <StartupNotice
        message="登录状态尚未完成恢复，请重试"
        onRetry={async () => {
          await controller.refresh();
        }}
      />
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        identity={controller.state.identity}
        format={controller.state.format}
        user={
          controller.state.user
            ? {
                email: controller.state.user.email,
                name: null,
                avatar: null,
              }
            : null
        }
        onLogout={() => void controller.logout()}
        busy={controller.busy === "logout"}
      />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb className="hidden md:flex">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/overview">Agents Plus</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {PAGE_META[pathname] ?? "工作区"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-3">
            <StatusBadge status={controller.state.status} />
            <PendingUpdatesBadge />
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">
              {controller.state.user?.email || "—"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void controller.logout()}
              disabled={controller.busy === "logout"}
            >
              <LogOut />
              退出
            </Button>
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          {controller.notice && (
            <div
              className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
              role="status"
            >
              {controller.notice}
            </div>
          )}
          {(controller.state.status === "error" ||
            controller.state.status === "offline") && (
            <div
              className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              <span className="flex-1">
                {controller.state.status === "offline"
                  ? "当前离线,数据可能不是最新。"
                  : "与后端同步失败,数据可能不是最新。"}
                {controller.state.message ? ` ${controller.state.message}` : null}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void controller.refresh()}
                disabled={controller.busy === "refresh"}
              >
                <RefreshCw />
                重新检查
              </Button>
            </div>
          )}
          <div className="flex-1 px-4 py-6 sm:px-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** 浏览器预览页提示：与原 ClientApp 的 DesktopRequiredState 行为一致。 */
function DesktopRequiredNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <RefreshCw className="size-5" />
        </div>
        <h1 className="text-xl font-semibold">请使用 Agents Plus 桌面应用</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Next.js 预览页面不会直接访问本机文件或发送凭据。请运行 npm run tauri
          dev，客户端会通过 Tauri 安全桥接连接真实后端。
        </p>
      </div>
    </main>
  );
}

/** 初次启动 / 鉴权未恢复时的加载占位。 */
function LoadingNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="animate-spin" />
        正在读取本机和后端状态
      </div>
    </main>
  );
}

/** 同步出错或离线时的错误页：允许用户点击重新检查。 */
function StartupNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <RefreshCw className="size-5" />
        </div>
        <h1 className="text-xl font-semibold">无法恢复登录状态</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-4" onClick={() => void onRetry()}>
          <RefreshCw />
          重新检查
        </Button>
      </div>
    </main>
  );
}


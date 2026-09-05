"use client";

import { useEffect } from "react";
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
import {
  SyncControllerProvider,
  useSyncController,
} from "@/features/sync/sync-controller-context";
import { useSyncController as useSyncControllerInstance } from "@/features/sync/use-sync-controller";

const PAGE_META: Record<string, string> = {
  "/overview": "概览",
  "/versions": "版本历史",
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

  if (!controller.desktop) {
    return <DesktopRequiredNotice />;
  }

  const isLoadingIdentity =
    controller.state.status === "loading" && !controller.state.identity;
  if (isLoadingIdentity) {
    return <LoadingNotice />;
  }

  if (
    controller.state.status === "error" ||
    controller.state.status === "offline"
  ) {
    return (
      <StartupNotice
        message={controller.state.message || "请检查网络连接和系统凭据存储"}
        onRetry={async () => {
          await controller.refresh();
        }}
      />
    );
  }

  if (!controller.state.user && controller.state.status !== "signedOut") {
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


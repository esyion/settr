"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  FileClock,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Devices } from "@/features/devices/components/devices";
import { Settings } from "@/features/settings/components/settings";
import { Overview } from "@/features/sync/components/overview";
import { useSyncController } from "@/features/sync/use-sync-controller";
import { Versions } from "@/features/versions/components/versions";
import { getApiBaseUrl } from "@/lib/api-client";
import type { SyncStatus } from "@/lib/contracts";

type Page = "overview" | "versions" | "devices" | "settings";
function statusLabel(status: SyncStatus) {
  return {
    loading: "加载中",
    signedOut: "未登录",
    localOnly: "仅本地文件",
    initialChoice: "等待首次绑定",
    synced: "已同步",
    localModified: "本地有修改",
    remoteModified: "云端有更新",
    conflict: "存在冲突",
    offline: "离线",
    error: "同步错误",
  }[status];
}
function statusVariant(status: SyncStatus) {
  if (status === "synced") return "default" as const;
  if (status === "conflict" || status === "error")
    return "destructive" as const;
  if (
    status === "localModified" ||
    status === "remoteModified" ||
    status === "initialChoice"
  )
    return "secondary" as const;
  return "outline" as const;
}

export function ClientApp() {
  const controller = useSyncController();
  const [page, setPage] = useState<Page>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="animate-spin" />
          正在读取本机和后端状态
        </div>
      </main>
    );
  if (!controller.desktop) return <main className="flex min-h-screen items-center justify-center bg-background px-6"><div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm"><Cloud className="mx-auto size-10 text-primary" /><h1 className="mt-4 text-xl font-semibold">请使用 Agents Plus 桌面应用</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Next.js 预览页面不会直接访问本机文件或发送凭据。请运行 npm run tauri dev，客户端会通过 Tauri 安全桥接连接真实后端。</p></div></main>;
  if (controller.state.status === "loading" && !controller.state.identity)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="animate-spin" />
          正在读取本机和后端状态
        </div>
      </main>
    );
  if (controller.state.status === "signedOut" || !controller.state.user)
    return (
      <AuthScreen
        identity={controller.state.identity}
        onAuthenticated={controller.loginCompleted}
      />
    );
  const nav = [
    { id: "overview" as const, label: "概览", icon: Cloud },
    { id: "versions" as const, label: "版本历史", icon: FileClock },
    { id: "devices" as const, label: "设备", icon: Users },
    { id: "settings" as const, label: "设置", icon: SettingsIcon },
  ];
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 py-5 sm:px-8">
        <header className="flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Cloud className="size-5" />
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                ~/.agents/AGENTS.md
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                Agents Plus
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusVariant(controller.state.status)}>
              {statusLabel(controller.state.status)}
            </Badge>
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">
              {controller.state.user.email}
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
        <div className="flex flex-1 flex-col gap-6 py-6 lg:grid lg:grid-cols-[220px_1fr]">
          <aside className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={
                    "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                    (page === item.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
            <div className="mt-auto hidden rounded-xl border bg-card p-3 text-xs text-muted-foreground lg:block">
              <p className="font-medium text-foreground">当前设备</p>
              <p className="mt-1 truncate">
                {controller.state.identity?.deviceName}
              </p>
              <p>
                {controller.state.identity?.platform} · v
                {controller.state.identity?.appVersion}
              </p>
            </div>
          </aside>
          <section className="min-w-0">
            {controller.notice && (
              <div
                className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
                role="status"
              >
                {controller.notice}
              </div>
            )}
            {page === "overview" && (
              <Overview
                state={controller.state}
                busy={controller.busy}
                mergeDraft={controller.mergeDraft}
                setMergeDraft={controller.setMergeDraft}
                onRefresh={controller.refresh}
                onUpload={controller.upload}
                onApply={controller.apply}
                onStartMerge={controller.startMerge}
                onResolveMerge={controller.resolveMerge}
              />
            )}
            {page === "versions" && (
              <Versions
                state={controller.state}
                busy={controller.busy}
                onRestore={controller.restore}
              />
            )}
            {page === "devices" && (
              <Devices
                devices={controller.state.devices}
                currentDeviceId={controller.state.identity?.deviceId}
                busy={controller.busy}
                onRename={controller.rename}
                onRevoke={controller.revoke}
              />
            )}
            {page === "settings" && (
              <Settings
                apiUrl={getApiBaseUrl()}
                identity={controller.state.identity}
                busy={controller.busy}
                onSaveApiUrl={controller.saveUrl}
                onRename={controller.rename}
                onLogout={controller.logout}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cloud,
  FileClock,
  Laptop,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getDocumentFormatConfig } from "@/lib/document-formats";
import type { DeviceIdentity, DocumentFormat } from "@/lib/contracts";

/** 侧边栏导航项定义：路径、图标、显示名。 */
const NAV_ITEMS = [
  { href: "/overview", label: "概览", icon: Cloud },
  { href: "/versions", label: "版本历史", icon: FileClock },
  { href: "/devices", label: "设备", icon: Users },
  { href: "/organization", label: "组织", icon: Users },
  { href: "/settings", label: "设置", icon: SettingsIcon },
] as const;

/**
 * 主应用侧边栏：基于 shadcn Sidebar 组件，使用 next/link 接入文件路由。
 * <p>
 * 当前路由高亮由 usePathname 推导，不再依赖组件内部 state。
 * 侧边栏底部展示当前设备信息和当前文档格式，方便用户随时确认上下文。
 */
export function AppSidebar({
  identity,
  format,
}: {
  identity: DeviceIdentity | null;
  format: DocumentFormat;
}) {
  const pathname = usePathname();
  const config = getDocumentFormatConfig(format);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="size-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="font-mono text-[10px] text-muted-foreground">
              {config.displayPath}
            </p>
            <p className="text-sm font-semibold tracking-tight">Agents Plus</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作区</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-foreground">
            <Laptop className="size-3.5" />
            <span className="font-medium">当前设备</span>
          </div>
          <p className="mt-1 truncate">{identity?.deviceName || "—"}</p>
          <p>
            {identity?.platform || "—"} · v{identity?.appVersion || "—"}
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

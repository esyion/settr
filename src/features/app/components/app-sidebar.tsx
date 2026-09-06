"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Cloud,
  FileClock,
  FolderTree,
  Laptop,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  UserPlus,
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
import { ContextSwitcher } from "@/features/context/components/context-switcher";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { getDocumentFormatConfig } from "@/lib/document-formats";
import type { DeviceIdentity, DocumentFormat } from "@/lib/contracts";

/** 个人空间导航项：概览 / 版本 / 设备 / 设置。 */
const PERSONAL_ITEMS = [
  { href: "/overview", label: "概览", icon: Cloud },
  { href: "/versions", label: "版本历史", icon: FileClock },
  { href: "/devices", label: "设备", icon: Users },
  { href: "/settings", label: "设置", icon: SettingsIcon },
] as const;

/** 组织空间导航项：组织概览 / 团队 / 成员 / 规范 / 角色。 */
const ORGANIZATION_ITEMS = [
  { href: "/organization", label: "组织概览", icon: Building2 },
  { href: "/organization/teams", label: "团队与项目", icon: FolderTree },
  { href: "/organization/memberships", label: "成员", icon: UserPlus },
  { href: "/organization/policies", label: "规范", icon: ScrollText },
  { href: "/organization/roles", label: "角色", icon: ShieldCheck },
] as const;

/**
 * 主应用侧边栏：上下文感知。
 * <ul>
 *   <li>个人空间（scope === "personal"）：概览 / 版本 / 设备 / 设置 + 组织 section</li>
 *   <li>组织空间（scope === "organization"）：组织概览 / 团队 / 成员 / 规范 / 角色</li>
 * </ul>
 * 当前路由高亮由 usePathname 推导。
 */
export function AppSidebar({
  identity,
  format,
}: {
  identity: DeviceIdentity | null;
  format: DocumentFormat;
}) {
  const pathname = usePathname();
  const ctx = useWorkspaceContextValue();
  const config = getDocumentFormatConfig(format);
  const isOrg = ctx.scope === "organization";

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
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <ContextSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isOrg ? (
          <SidebarGroup>
            <SidebarGroupLabel>组织空间</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ORGANIZATION_ITEMS.map((item) => {
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
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>工作区</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {PERSONAL_ITEMS.map((item) => {
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
            <SidebarGroup>
              <SidebarGroupLabel>组织</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === "/organization" ||
                        pathname.startsWith("/organization/")
                      }
                      tooltip="组织"
                    >
                      <Link href="/organization">
                        <Building2 />
                        <span>加入或创建组织</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
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
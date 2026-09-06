"use client";

import { usePathname } from "next/navigation";
import {
  Building2,
  Cloud,
  FileClock,
  FolderTree,
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
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavMain, type NavMainGroup } from "@/features/app/components/nav-main";
import { UserMenu, type UserMenuUser } from "@/features/app/components/user-menu";
import { WorkspaceSwitcher } from "@/features/app/components/workspace-switcher";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { getDocumentFormatConfig } from "@/lib/document-formats";
import type { DeviceIdentity, DocumentFormat } from "@/lib/contracts";

/** 个人空间下的导航组:工作区(概览/版本/设备/设置)+ 组织(加入或创建)。 */
const PERSONAL_GROUPS: NavMainGroup[] = [
  {
    label: "工作区",
    items: [
      { href: "/overview", label: "概览", icon: Cloud },
      { href: "/versions", label: "版本历史", icon: FileClock },
      { href: "/devices", label: "设备", icon: Users },
      { href: "/settings", label: "设置", icon: SettingsIcon },
    ],
  },
  {
    label: "组织",
    items: [{ href: "/organization", label: "加入或创建组织", icon: Building2 }],
  },
];

/** 组织空间下的导航组:组织概览 / 团队与项目 / 成员 / 规范 / 角色。 */
const ORGANIZATION_GROUPS: NavMainGroup[] = [
  {
    label: "组织空间",
    items: [
      { href: "/organization", label: "组织概览", icon: Building2 },
      { href: "/organization/teams", label: "团队与项目", icon: FolderTree },
      { href: "/organization/memberships", label: "成员", icon: UserPlus },
      { href: "/organization/policies", label: "规范", icon: ScrollText },
      { href: "/organization/roles", label: "角色", icon: ShieldCheck },
    ],
  },
];

/**
 * 主应用侧边栏的组合层:Header = WorkspaceSwitcher,Content = NavMain,Footer = UserMenu。
 * 全部数据由 props 注入,自身只读 usePathname 和 useWorkspaceContextValue 用于路由高亮和分组切换。
 */
export function AppSidebar({
  identity,
  format,
  user,
  onLogout,
  busy,
}: {
  identity: DeviceIdentity | null;
  format: DocumentFormat;
  user: UserMenuUser | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const pathname = usePathname();
  const ctx = useWorkspaceContextValue();
  // format 暂时未直接消费,但保留 prop 以避免 layout 端重复改签名
  void getDocumentFormatConfig(format);
  const isOrg = ctx.scope === "organization";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          groups={isOrg ? ORGANIZATION_GROUPS : PERSONAL_GROUPS}
          pathname={pathname}
        />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu
          user={user}
          identity={identity}
          onLogout={onLogout}
          busy={busy}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

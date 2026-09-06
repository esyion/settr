"use client";

import { ChevronsUpDown, Laptop, LogOut } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { DeviceIdentity } from "@/lib/contracts";

/** UserMenu 的用户数据形状:与 controller.state.user 解耦,只取展示需要的字段。 */
export type UserMenuUser = {
  name?: string | null;
  email: string;
  avatar?: string | null;
};

/** AppSidebar 的底部用户菜单:对齐 shadcn NavUser,菜单项精简为「用户信息 + 设备信息 + 退出」。 */
export function UserMenu({
  user,
  identity,
  onLogout,
  busy,
}: {
  user: UserMenuUser | null;
  identity: DeviceIdentity | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const { isMobile } = useSidebar();
  const displayName = user?.name || user?.email.split("@")[0] || "";
  const deviceSubtitle = identity?.deviceName || "未识别设备";
  const email = user?.email ?? "";
  const fallbackLetter = email.charAt(0).toUpperCase() || "?";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {user?.avatar ? (
                  <AvatarImage src={user.avatar} alt={displayName} />
                ) : null}
                <AvatarFallback className="rounded-lg">
                  {fallbackLetter}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{deviceSubtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user?.avatar ? (
                    <AvatarImage src={user.avatar} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {fallbackLetter}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              aria-disabled
              onSelect={(event) => event.preventDefault()}
              className="cursor-default focus:bg-transparent"
            >
              <Laptop />
              <span>当前设备</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {identity?.platform ?? "—"} · v{identity?.appVersion ?? "—"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout} disabled={busy}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

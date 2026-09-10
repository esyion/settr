"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown, Cloud, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspaceStore } from "@/features/context/store";
import {
  LeaveOrganizationDialog,
  useLeaveOrganizationDialog,
} from "@/features/context/components/leave-organization-dialog";
import { toast } from "sonner";

/** AppSidebar 顶部的品牌 + scope 切换控件：对齐 shadcn TeamSwitcher。 */
export function WorkspaceSwitcher() {
  const ctx = useWorkspaceStore();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const leaveDialog = useLeaveOrganizationDialog();

  const isOrg = ctx.scope === "organization";
  const title = isOrg
    ? ctx.organizationName || "选择组织"
    : "个人空间";
  const subtitle = isOrg ? "团队空间" : "桌面 · 已同步";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={ctx.loading}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Cloud className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{title}</span>
                <span className="truncate text-xs">{subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              切换工作区
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                ctx.clearOrganization();
                toast.success("已切换到个人空间");
              }}
              className="flex items-center gap-2"
            >
              <User className="size-4" />
              <span>个人空间</span>
              {!isOrg && (
                <span className="ml-auto text-xs text-muted-foreground">
                  当前
                </span>
              )}
            </DropdownMenuItem>
            {ctx.organizations.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  我的组织
                </DropdownMenuLabel>
                {ctx.organizations.map((org) => (
                  <DropdownMenuSub key={org.id}>
                    <DropdownMenuSubTrigger className="flex items-center gap-2">
                      <Building2 className="size-4" />
                      <span className="truncate">{org.name}</span>
                      {ctx.organizationId === org.id && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          当前
                        </span>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => {
                          ctx.setOrganization(org.id);
                          toast.success(`已切换到 ${org.name}`);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Building2 className="size-4" />
                        切换到 {org.name}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                          // 阻止菜单关闭后立即重新触发点击，保留主菜单关闭但弹窗打开
                          event.preventDefault();
                          leaveDialog.setLeaving(org);
                        }}
                        className="flex items-center gap-2"
                      >
                        <LogOut className="size-4" />
                        退出 {org.name}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/organization")}
              className="flex items-center gap-2"
            >
              <Building2 className="size-4" />
              进入组织管理
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <LeaveOrganizationDialog
        leaving={leaveDialog.leaving}
        busy={leaveDialog.busy}
        onClose={leaveDialog.close}
        onConfirm={leaveDialog.confirm}
      />
    </SidebarMenu>
  );
}


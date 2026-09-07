"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";

/**
 * 上下文切换器：在侧边栏顶部显示当前激活的工作区，并允许在个人空间 / 组织之间切换。
 */
export function ContextSwitcher() {
  const ctx = useWorkspaceStore();
  const router = useRouter();

  const triggerLabel =
    ctx.scope === "organization"
      ? ctx.organizationName || "选择组织"
      : "个人空间";
  const TriggerIcon = ctx.scope === "organization" ? Building2 : User;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2"
          disabled={ctx.loading}
        >
          <span className="flex items-center gap-2 truncate">
            <TriggerIcon className="size-4 shrink-0" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>切换工作区</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            ctx.clearOrganization();
            toast.success("已切换到个人空间");
          }}
          className="flex items-center gap-2"
        >
          <User className="size-4" />
          <span>个人空间</span>
          {ctx.scope === "personal" && (
            <span className="ml-auto text-xs text-muted-foreground">当前</span>
          )}
        </DropdownMenuItem>

        {ctx.organizations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              我的组织
            </DropdownMenuLabel>
            {ctx.organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => {
                  ctx.setOrganization(org.id);
                  toast.success(`已切换到 ${org.name}`);
                }}
                className="flex items-center gap-2"
              >
                <Building2 className="size-4" />
                <span className="truncate">{org.name}</span>
                {ctx.organizationId === org.id && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    当前
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            router.push("/organization");
          }}
        >
          <Building2 className="size-4" />
          进入组织管理
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
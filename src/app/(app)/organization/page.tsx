"use client";

import { Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";

/**
 * 组织空间根概览页：当前激活组织的基本信息 + 快捷入口。
 * <p>
 * 受 (app)/organization/layout.tsx 守卫：未选择组织时不会渲染到这里。
 */
export default function OrganizationOverviewPage() {
  const ctx = useWorkspaceContextValue();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="工作区"
        title={ctx.organizationName ?? "组织"}
        description="当前组织的管理入口。"
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            组织概览
          </CardTitle>
          <CardDescription>
            使用左侧菜单进入团队与项目、成员管理、规范和角色。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            组织 ID:{" "}
            <code className="font-mono">{ctx.organizationId ?? "—"}</code>
          </p>
          {ctx.organizations.length > 1 && (
            <p className="text-xs text-muted-foreground">
              你还属于其他 {ctx.organizations.length - 1} 个组织，
              可通过侧边栏顶部切换。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
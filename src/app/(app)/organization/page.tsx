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
import { CreateOrganizationForm } from "@/features/teams/components/create-forms";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";

/**
 * 组织空间根页面：双模式。
 * <ul>
 *   <li>scope === "personal"：显示创建组织表单 + 引导文案；</li>
 *   <li>scope === "organization"：显示当前组织概览 + 多组织提示。</li>
 * </ul>
 */
export default function OrganizationOverviewPage() {
  const ctx = useWorkspaceContextValue();

  if (ctx.scope === "organization") {
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

  // scope === "personal"：引导用户创建第一个组织
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="工作区"
        title="创建你的组织"
        description="组织是团队与项目的容器,创建后即可邀请成员、配置角色与规范。"
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            为什么需要组织？
          </CardTitle>
          <CardDescription>
            组织是 to B 治理的容器——团队、项目、成员、角色、规范都挂在组织下。
            个人用户可继续在「个人空间」管理自己的设备与版本,无需创建组织。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </div>
  );
}
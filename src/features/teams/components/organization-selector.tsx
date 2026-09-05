"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 组织选择器：在 teams feature 顶部显示当前组织，
 * 并允许切换（实际上是 ContextSwitcher 的子集展示）。
 */
export function OrganizationSelector({ data }: { data: TeamsDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>当前组织</CardTitle>
        <CardDescription>
          切换或创建组织以管理其下的团队与项目。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.organizationId ? (
          <p className="text-sm">组织 ID: <code className="font-mono">{data.organizationId}</code></p>
        ) : (
          <p className="text-sm text-muted-foreground">
            请通过侧边栏的上下文切换器选择一个组织。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
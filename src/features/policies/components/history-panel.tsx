"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 政策历史面板：挂载时自动加载 AGENT/CLAUDE 历史，
 * 用 Tabs 分开显示。版本列表按时间倒序展示。
 */
export function HistoryCard({ data }: { data: PoliciesDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>版本历史</CardTitle>
        <CardDescription>已批准的政策版本</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="AGENT">
          <TabsList>
            <TabsTrigger value="AGENT">AGENT</TabsTrigger>
            <TabsTrigger value="CLAUDE">CLAUDE</TabsTrigger>
          </TabsList>
          <TabsContent value="AGENT" className="mt-3">
            <VersionList items={data.agentVersions} />
          </TabsContent>
          <TabsContent value="CLAUDE" className="mt-3">
            <VersionList items={data.claudeVersions} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * 版本列表子组件：复用，避免重复代码。
 */
function VersionList({
  items,
}: {
  items: ReadonlyArray<{
    id: string;
    versionNo: number;
    content: string;
    sha256: string;
    status: string;
  }>;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">暂无版本历史</p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((v) => (
        <li
          key={v.id}
          className="rounded-md border p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">v{v.versionNo}</span>
            <code className="font-mono text-xs text-muted-foreground">
              {v.sha256.slice(0, 12)}
            </code>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
            {v.content}
          </pre>
        </li>
      ))}
    </ul>
  );
}
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DistributePolicyDialog,
} from "@/features/policies/components/distribute-policy-dialog";
import type { PolicyVersion } from "@/lib/contracts";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 政策历史面板：挂载时自动加载 AGENT/CLAUDE 历史，
 * 用 Tabs 分开显示。版本列表按时间倒序展示;
 * APPROVED 版本对拥有 policy:distribute 权限的主体提供"分发"入口。
 */
export function HistoryCard({ data }: { data: PoliciesDataApi }) {
  const [distributeTarget, setDistributeTarget] = useState<PolicyVersion | null>(
    null,
  );

  /**
   * 对话框提交处理:分发成功后关闭;失败保持打开(toast 已由数据中枢提示)。
   */
  const handleDistributeSubmit = async (input: {
    scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
    teamId?: string;
    memberId?: string;
  }) => {
    if (!distributeTarget) return;
    try {
      await data.distributePolicyVersion({
        versionId: distributeTarget.id,
        ...input,
      });
      setDistributeTarget(null);
    } catch {
      // 失败 toast 已由数据中枢提示;保持对话框打开供重试
    }
  };

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
            <VersionList
              items={data.agentVersions}
              canDistribute={data.canDistributePolicy}
              disabled={data.busy !== null}
              onDistribute={setDistributeTarget}
            />
          </TabsContent>
          <TabsContent value="CLAUDE" className="mt-3">
            <VersionList
              items={data.claudeVersions}
              canDistribute={data.canDistributePolicy}
              disabled={data.busy !== null}
              onDistribute={setDistributeTarget}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
      <DistributePolicyDialog
        open={distributeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDistributeTarget(null);
        }}
        organizationId={data.organizationId}
        busy={data.busy !== null}
        onSubmit={handleDistributeSubmit}
      />
    </Card>
  );
}

/**
 * 版本列表子组件:复用,避免重复代码;
 * canDistribute 时对 APPROVED 版本渲染"分发"按钮(后端仅允许分发 APPROVED 版本)。
 */
function VersionList({
  items,
  canDistribute,
  disabled,
  onDistribute,
}: {
  items: ReadonlyArray<PolicyVersion>;
  canDistribute: boolean;
  disabled: boolean;
  onDistribute: (version: PolicyVersion) => void;
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
            <span className="font-medium">
              v{v.versionNo}
              <span className="ml-2 text-xs text-muted-foreground">{v.status}</span>
            </span>
            <span className="flex items-center gap-2">
              <code className="font-mono text-xs text-muted-foreground">
                {v.sha256.slice(0, 12)}
              </code>
              {canDistribute && v.status === "APPROVED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onDistribute(v)}
                >
                  分发
                </Button>
              )}
            </span>
          </div>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
            {v.content}
          </pre>
        </li>
      ))}
    </ul>
  );
}
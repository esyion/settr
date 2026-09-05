"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 当前生效政策展示。
 */
export function EffectivePolicyCard({ data }: { data: PoliciesDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>当前生效政策</CardTitle>
        <CardDescription>
          组织当前应用的 AGENT / CLAUDE 政策
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.effectivePolicies ? (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="font-medium">AGENT</p>
              {data.effectivePolicies.agent ? (
                <pre className="rounded-md bg-muted p-2 text-xs">
                  {data.effectivePolicies.agent.content}
                </pre>
              ) : (
                <p className="text-muted-foreground">无</p>
              )}
            </div>
            <div>
              <p className="font-medium">CLAUDE</p>
              {data.effectivePolicies.claude ? (
                <pre className="rounded-md bg-muted p-2 text-xs">
                  {data.effectivePolicies.claude.content}
                </pre>
              ) : (
                <p className="text-muted-foreground">无</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            当前组织暂无生效政策
          </p>
        )}
      </CardContent>
    </Card>
  );
}
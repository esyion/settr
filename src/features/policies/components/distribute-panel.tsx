"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 分发面板：展示已分发的政策版本，并提供撤回操作。
 */
export function DistributePanel({ data }: { data: PoliciesDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>政策分发</CardTitle>
        <CardDescription>已分发的政策版本与撤回操作</CardDescription>
      </CardHeader>
      <CardContent>
        {data.distributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无分发</p>
        ) : (
          <ul className="space-y-2">
            {data.distributions.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{d.scopeType}</p>
                  <p className="text-xs text-muted-foreground">
                    版本 {d.versionId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.withdrawn ? (
                    <span className="text-xs text-muted-foreground">已撤回</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={data.busy !== null}
                      onClick={() => void data.withdrawDistribution(d.id)}
                    >
                      <Trash2 />
                      撤回
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
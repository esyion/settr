"use client";

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
 * 待审批政策列表。
 */
export function PendingPoliciesCard({ data }: { data: PoliciesDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>待审批政策</CardTitle>
        <CardDescription>
          等待组织管理员审批的草稿
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.pendingPolicies.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无待审批政策</p>
        ) : (
          <ul className="space-y-2">
            {data.pendingPolicies.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{p.message}</p>
                  <p className="text-xs text-muted-foreground">
                    状态：{p.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={data.busy !== null}
                    onClick={() => void data.reviewPolicyChange(p.id, "APPROVED")}
                  >
                    批准
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.busy !== null}
                    onClick={() => void data.reviewPolicyChange(p.id, "REJECTED")}
                  >
                    拒绝
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
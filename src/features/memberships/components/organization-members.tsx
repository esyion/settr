"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { MembershipsDataApi } from "@/features/memberships/types";

/**
 * 组织成员列表：展示当前组织的成员并允许启用/停用/移除。
 * 添加成员请通过邀请流程，详见 memberships 页右上角。
 */
export function OrganizationMembers({ data }: { data: MembershipsDataApi }) {
  if (!data.organizationId) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>组织成员</CardTitle>
        <CardDescription>
          {data.memberships.length} 位成员，状态控制访问。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Alert>
          <AlertCircle />
          <AlertTitle>添加成员请使用邀请</AlertTitle>
          <AlertDescription>
            点击右上角「邀请成员」按钮，通过邮件发送邀请链接。
          </AlertDescription>
        </Alert>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">该组织暂无成员</p>
        ) : (
          <ul className="space-y-2">
            {data.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{m.userId}</p>
                  <p className="text-xs text-muted-foreground">
                    状态：{m.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  {m.status === "DISABLED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.busy !== null}
                      onClick={() => void data.enableMembership(m.id)}
                    >
                      启用
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.busy !== null}
                      onClick={() => void data.disableMembership(m.id)}
                    >
                      停用
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={data.busy !== null}
                    onClick={() => void data.removeMembership(m.id)}
                  >
                    移除
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
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
import type { RolesDataApi } from "@/features/roles/types";

/**
 * 角色分配列表：展示当前组织的所有角色绑定，
 * 提供撤销按钮（直接走 DELETE /role-assignments/{id}）。
 */
export function AssignmentsCard({ data }: { data: RolesDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>角色分配</CardTitle>
        <CardDescription>
          {data.roleAssignments.length} 条分配记录
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.roleAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无分配</p>
        ) : (
          <ul className="space-y-2">
            {data.roleAssignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    成员 {a.userId} ← 角色 {a.roleId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ID: {a.id}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={data.busy !== null}
                  onClick={() => void data.revokeRoleAssignment(a.id)}
                >
                  <Trash2 />
                  撤销
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
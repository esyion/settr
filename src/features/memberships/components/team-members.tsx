"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MembershipsDataApi } from "@/features/memberships/types";

/**
 * 团队成员列表：展示当前团队成员并允许启用/停用/移除。
 */
export function TeamMembers({ data }: { data: MembershipsDataApi }) {
  if (!data.teamId) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>团队成员</CardTitle>
        <CardDescription>
          {data.teamMemberships.length} 位团队成员。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.teamMemberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">该团队暂无成员</p>
        ) : (
          <ul className="space-y-2">
            {data.teamMemberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{m.organizationMemberId}</p>
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
                      onClick={() => void data.enableTeamMembership(m.id)}
                    >
                      启用
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.busy !== null}
                      onClick={() => void data.disableTeamMembership(m.id)}
                    >
                      停用
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={data.busy !== null}
                    onClick={() => void data.removeTeamMembership(m.id)}
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
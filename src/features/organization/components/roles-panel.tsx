"use client";

import { useState } from "react";
import { ShieldPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { OrganizationDataApi } from "@/features/organization/hooks/use-organization-data";

const SEP = " · ";
const ARROW = " → ";


/**
 * 角色分配面板：把组织成员绑定到指定角色（组织 / 团队 / 项目）。
 */
export function RolesPanel({ data }: { data: OrganizationDataApi }) {
  return (
    <div className="flex flex-col gap-6">
      <AssignRoleCard data={data} />
      <AssignmentsCard data={data} />
    </div>
  );
}

function AssignRoleCard({ data }: { data: OrganizationDataApi }) {
  const [memberId, setMemberId] = useState("");
  const [roleId, setRoleId] = useState("");
  const busy = data.busy === "分配角色";

  async function submit() {
    if (!memberId || !roleId) return;
    await data.assignRole({ organizationMemberId: memberId, roleId });
    setMemberId("");
    setRoleId("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldPlus className="size-5" />
          分配角色
        </CardTitle>
        <CardDescription>
          选择组织成员和角色，把权限绑定到对应范围（组织 / 团队 / 项目）。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>组织成员</Label>
          <Select
            value={memberId || "__none__"}
            onValueChange={(value) =>
              setMemberId(value === "__none__" ? "" : value)
            }
            disabled={data.members.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择成员" />
            </SelectTrigger>
            <SelectContent>
              {data.members.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  当前组织还没有成员
                </SelectItem>
              ) : (
                data.members.map((member) => (
                  <SelectItem
                    key={member.id}
                    value={member.id}
                    disabled={member.status !== "ACTIVE"}
                  >
                    {member.userId}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>角色</Label>
          <Select
            value={roleId || "__none__"}
            onValueChange={(value) =>
              setRoleId(value === "__none__" ? "" : value)
            }
            disabled={data.roles.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择角色" />
            </SelectTrigger>
            <SelectContent>
              {data.roles.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  当前组织还没有角色
                </SelectItem>
              ) : (
                data.roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.roleName}
                    {role.scope ? (SEP + role.scope) : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button
            onClick={() => void submit()}
            disabled={busy || !memberId || !roleId || !data.organizationId}
          >
            <ShieldPlus />
            分配
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function AssignmentsCard({ data }: { data: OrganizationDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>当前角色分配</CardTitle>
        <CardDescription>
          已分配的成员-角色绑定；可撤销后重新分配。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.roleAssignments.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldPlus />
              </EmptyMedia>
              <EmptyTitle>暂无角色分配</EmptyTitle>
              <EmptyDescription>
                使用上方表单把角色绑定到组织成员。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.roleAssignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p>
                    <span className="font-medium">用户 {assignment.userId}</span>
                    <span className="mx-2 text-muted-foreground">{ARROW}</span>
                    <span>角色 {assignment.roleId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    组织 {assignment.organizationId}
                    {assignment.teamId ? (SEP + "团队 " + assignment.teamId) : ""}
                    {assignment.projectId
                      ? (SEP + "项目 " + assignment.projectId)
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void data.revokeRoleAssignment(assignment.id)}
                  disabled={data.busy === "撤销角色"}
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

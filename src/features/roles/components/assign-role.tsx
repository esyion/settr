"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
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
  MEMBERSHIP_STATUS,
  membershipStatusLabel,
  type Membership,
} from "@/lib/contracts";
import type { RolesDataApi } from "@/features/roles/types";

/**
 * 角色分配表单。
 *
 * 成员下拉:从 memberships 列表选择,不再要求手输 UUID;
 * 角色下拉:从 data.roles 列出 roleName。
 */
export function AssignRoleCard({
  data,
  memberships,
}: {
  data: RolesDataApi;
  memberships: Membership[];
}) {
  const [organizationMemberId, setOrganizationMemberId] = useState("");
  const [roleId, setRoleId] = useState("");

  // 仅展示可分配角色的成员:ACTIVE 或历史无状态数据(早期枚举缺失),
  // DISABLED 与 REMOVED 成员已自动排除。
  const memberOptions = memberships.filter(
    (m) => m.status === MEMBERSHIP_STATUS.ACTIVE || m.status === undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>分配角色</CardTitle>
        <CardDescription>
          为组织成员绑定一个 RBAC 角色
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void data.assignRole({ organizationMemberId, roleId });
            setOrganizationMemberId("");
            setRoleId("");
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-id">成员</Label>
            <Select
              value={organizationMemberId}
              onValueChange={setOrganizationMemberId}
            >
              <SelectTrigger id="member-id">
                <SelectValue
                  placeholder={
                    memberOptions.length === 0
                      ? "暂无活跃成员"
                      : "选择组织成员"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {memberOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {memberLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="role-id">角色</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="role-id">
                <SelectValue placeholder="选择角色" />
              </SelectTrigger>
              <SelectContent>
                {data.roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.roleName}
                    {r.roleCode ? ` (${r.roleCode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={
              data.busy !== null || !organizationMemberId || !roleId
            }
          >
            <UserPlus />
            分配
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** 成员下拉项的展示标签:首选用户邮箱,缺失时回退到用户 ID(早期数据兜底)。 */
function memberLabel(m: Membership): string {
  return `${m.email ?? `用户 ${m.userId}`} · ${membershipStatusLabel(m.status)}`;
}

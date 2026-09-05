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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RolesDataApi } from "@/features/roles/types";

/**
 * 角色分配表单。
 */
export function AssignRoleCard({ data }: { data: RolesDataApi }) {
  const [organizationMemberId, setOrganizationMemberId] = useState("");
  const [roleId, setRoleId] = useState("");

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
            <Label htmlFor="member-id">成员 ID</Label>
            <Input
              id="member-id"
              value={organizationMemberId}
              onChange={(e) => setOrganizationMemberId(e.target.value)}
              placeholder="组织成员 ID"
            />
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={
              data.busy !== null || !organizationMemberId.trim() || !roleId
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
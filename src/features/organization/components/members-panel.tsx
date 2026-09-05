"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatTime } from "@/lib/format";
import type { OrganizationDataApi } from "@/features/organization/hooks/use-organization-data";

/**
 * 成员管理面板：组织成员 + 团队成员两段式管理。
 * <p>
 * 组织成员面向整个组织；团队成员仅在选定团队后展示，便于按范围授权。
 */
export function MembersPanel({ data }: { data: OrganizationDataApi }) {
  return (
    <div className="flex flex-col gap-6">
      <OrganizationMembersCard data={data} />
      {data.teamId && <TeamMembersCard data={data} />}
    </div>
  );
}

function OrganizationMembersCard({ data }: { data: OrganizationDataApi }) {
  const [userId, setUserId] = useState("");
  const busy = data.busy === "添加成员";
  async function submit() {
    await data.addOrganizationMember(userId);
    setUserId("");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>组织成员</CardTitle>
        <CardDescription>
          通过用户 ID 把新成员加入当前组织；可单独启用 / 禁用 / 移除。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-add">添加成员</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="member-add"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="用户 ID"
              maxLength={64}
            />
            <Button
              onClick={() => void submit()}
              disabled={busy || !userId.trim() || !data.organizationId}
            >
              <UserPlus />
              添加成员
            </Button>
          </div>
        </div>
        {data.members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserPlus />
              </EmptyMedia>
              <EmptyTitle>组织还没有成员</EmptyTitle>
              <EmptyDescription>使用上方输入框添加第一位成员。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">用户 {member.userId}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    成员 ID：{member.id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={member.status === "ACTIVE" ? "default" : "outline"}
                  >
                    {member.status}
                  </Badge>
                  {member.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void data.disableOrganizationMember(member.id)}
                      disabled={data.busy === "成员disable"}
                    >
                      禁用
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void data.enableOrganizationMember(member.id)}
                      disabled={data.busy === "成员enable"}
                    >
                      启用
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void data.removeOrganizationMember(member.id)}
                    disabled={data.busy === "成员remove"}
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

function TeamMembersCard({ data }: { data: OrganizationDataApi }) {
  const [organizationMemberId, setOrganizationMemberId] = useState("");
  const busy = data.busy === "添加团队成员";
  async function submit() {
    await data.addTeamMember(organizationMemberId);
    setOrganizationMemberId("");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>团队成员</CardTitle>
        <CardDescription>
          从组织成员中选择人员加入当前团队，并维护其启用状态。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="team-member-add">添加团队成员</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={organizationMemberId || "__none__"}
              onValueChange={(next) =>
                setOrganizationMemberId(next === "__none__" ? "" : next)
              }
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="选择组织成员" />
              </SelectTrigger>
              <SelectContent>
                {data.members.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    暂无组织成员
                  </SelectItem>
                ) : (
                  data.members.map((member) => (
                    <SelectItem
                      key={member.id}
                      value={member.id}
                      disabled={member.status !== "ACTIVE"}
                    >
                      {member.userId}（{member.status}）
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={() => void submit()}
              disabled={busy || !organizationMemberId}
            >
              <UserPlus />
              添加到团队
            </Button>
          </div>
        </div>
        {data.teamMembers.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserPlus />
              </EmptyMedia>
              <EmptyTitle>团队还没有成员</EmptyTitle>
              <EmptyDescription>
                使用上方选择器从组织成员中添加团队成员。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.teamMembers.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    组织成员 {member.organizationMemberId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    加入时间：{formatTime(member.id)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={member.status === "ACTIVE" ? "default" : "outline"}
                  >
                    {member.status}
                  </Badge>
                  {member.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void data.disableTeamMember(member.organizationMemberId)
                      }
                      disabled={data.busy === "团队成员disable"}
                    >
                      禁用
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void data.enableTeamMember(member.organizationMemberId)
                      }
                      disabled={data.busy === "团队成员enable"}
                    >
                      启用
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      void data.removeTeamMember(member.organizationMemberId)
                    }
                    disabled={data.busy === "团队成员remove"}
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

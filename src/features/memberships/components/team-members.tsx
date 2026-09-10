"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { MembershipsDataApi } from "@/features/memberships/types";

/**
 * 团队成员列表:展示当前团队成员并允许启用/停用/移除,以及添加成员。
 *
 * 添加成员：使用组织成员下拉选择要加入的人,避免手输 UUID。
 */
export function TeamMembers({ data }: { data: MembershipsDataApi }) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  if (!data.teamId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>团队成员</CardTitle>
          <CardDescription>请先在团队卡片中选择一个团队</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const existingMemberIds = new Set(
    data.teamMemberships.map((m) => m.organizationMemberId),
  );
  const availableMembers = data.memberships.filter(
    (m) => !existingMemberIds.has(m.id),
  );

  async function handleAdd() {
    if (!selectedMemberId) return;
    try {
      await data.addTeamMembership(selectedMemberId);
      setAddOpen(false);
      setSelectedMemberId("");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "添加团队成员失败",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>团队成员</CardTitle>
            <CardDescription>
              {data.teamMemberships.length} 位团队成员。
            </CardDescription>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={availableMembers.length === 0}>
                <Plus />
                添加成员
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="size-5" />
                  添加团队成员
                </DialogTitle>
                <DialogDescription>
                  从组织成员中选择要加入此团队的人。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="add-team-member">组织成员</Label>
                <Select
                  value={selectedMemberId}
                  onValueChange={setSelectedMemberId}
                >
                  <SelectTrigger id="add-team-member">
                    <SelectValue placeholder="选择成员" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.userId} · {m.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setAddOpen(false)}
                  disabled={data.busy !== null}
                >
                  取消
                </Button>
                <Button
                  onClick={() => void handleAdd()}
                  disabled={!selectedMemberId || data.busy !== null}
                >
                  <Plus />
                  添加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
                    状态:{m.status}
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

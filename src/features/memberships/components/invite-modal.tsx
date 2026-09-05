"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { membershipsApi } from "@/features/memberships/api";
import { useWorkspaceStore } from "@/features/context/store";
import { useTeamsData } from "@/features/teams";

/**
 * 邀请成员弹窗：邮箱（必填）+ 可选角色 + 可选团队。
 * 提交后调 POST /api/v1/organizations/{orgId}/invitations，
 * 后端生成一次性 token 并发送邮件。
 */
export function InviteModal({ children }: { children: React.ReactNode }) {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const teams = useTeamsData();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!organizationId || !email.trim() || busy) return;
    setBusy(true);
    try {
      await membershipsApi.createInvitation(organizationId, {
        email: email.trim(),
        roleId: roleId || null,
        teamIds,
      });
      toast.success(`邀请已发送至 ${email}`);
      setOpen(false);
      setEmail("");
      setRoleId("");
      setTeamIds([]);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "邀请失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            邀请新成员
          </DialogTitle>
          <DialogDescription>
            邀请发出后,被邀请人会收到一封邮件。链接 72 小时内有效。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">邮箱</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label htmlFor="invite-role">角色(可选)</Label>
            <Input
              id="invite-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder="角色 ID（可选）"
            />
          </div>
          <div>
            <Label>加入团队(可选)</Label>
            <div className="space-y-2">
              {teams.teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  当前组织暂无团队
                </p>
              ) : (
                teams.teams.map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={teamIds.includes(team.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTeamIds([...teamIds, team.id]);
                        } else {
                          setTeamIds(
                            teamIds.filter((id) => id !== team.id),
                          );
                        }
                      }}
                    />
                    {team.name}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={busy || !email.trim()}
          >
            <Send />
            发送邀请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
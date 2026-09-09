"use client";

import { useState } from "react";
import { Check, Copy, Link2, Mail, Send } from "lucide-react";
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
import { copyTextToClipboard } from "@/services/clipboard";
import { ACCEPT_INVITE_HOST, RESET_PASSWORD_SCHEME } from "@/lib/deep-link";

/**
 * 用明文邀请 token 拼桌面端深链，格式与 lib/deep-link 的解析约定一致。
 *
 * @param token 创建邀请响应中的明文 token
 * @returns 形如 agentsplus://accept-invite?token=xxx 的深链
 */
function buildInviteLink(token: string): string {
  return RESET_PASSWORD_SCHEME + "://" + ACCEPT_INVITE_HOST + "?token=" + token;
}

/**
 * 邀请成员弹窗：邮箱（必填）+ 可选角色 + 可选团队。
 * 提交后调 POST /api/v1/organizations/{orgId}/invitations；
 * 后端发送邀请邮件，同时响应携带一次性明文 token，弹窗展示对应深链供邀请人复制兜底
 * （邮件送达失败或被邀请人找不到邮件时，可通过 IM 直接把链接发给对方）。
 */
export function InviteModal({ children }: { children: React.ReactNode }) {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const teams = useTeamsData();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** 创建成功后展示的邀请深链；为 null 时显示表单，非 null 时显示成功面板。 */
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * 提交邀请；成功后保留弹窗并切换到深链展示面板，失败时 toast 错误。
   */
  async function submit() {
    if (!organizationId || !email.trim() || busy) return;
    setBusy(true);
    try {
      const invitation = await membershipsApi.createInvitation(organizationId, {
        email: email.trim(),
        roleId: roleId || null,
        teamIds,
      });
      if (invitation.token) {
        setInviteLink(buildInviteLink(invitation.token));
        setCopied(false);
      } else {
        toast.success(`邀请已发送至 ${email}`);
        setOpen(false);
      }
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

  /**
   * 复制深链到系统剪贴板；两秒后恢复按钮态。
   */
  async function copyLink() {
    if (!inviteLink) return;
    try {
      await copyTextToClipboard(inviteLink);
      setCopied(true);
      toast.success("邀请链接已复制");
      window.setTimeout(() => setCopied(false), 2000);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "复制失败",
      );
    }
  }

  /**
   * 关闭弹窗并重置全部表单与成功面板状态。
   */
  function closeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setInviteLink(null);
      setEmail("");
      setRoleId("");
      setTeamIds([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        {inviteLink ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="size-5" />
                邀请已发送
              </DialogTitle>
              <DialogDescription>
                邀请邮件已发送，链接 72 小时内有效。对方在桌面应用中打开链接即可加入。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  <Link2 className="size-3.5" />
                  邀请链接（邮件送达不及时的兜底）
                </Label>
                <div className="rounded-md border bg-muted/40 p-2.5">
                  <p className="font-mono text-xs break-all text-muted-foreground select-all">
                    {inviteLink}
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={copyLink}>
                {copied ? <Check /> : <Copy />}
                {copied ? "已复制" : "复制邀请链接"}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => closeDialog(false)}>完成</Button>
            </DialogFooter>
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

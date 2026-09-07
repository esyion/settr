"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishSkillVersion, fileToBytesAsync } from "@/features/skills/api";
import { toast } from "sonner";

const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * 发布新版本对话框:上传 ZIP 并填写版本号。
 * 从 Skill 详情页调用,发布成功后回调 onPublished 刷新版本列表。
 */
export function PublishVersionDialog({
  skillId, open, onOpenChange, onPublished,
}: {
  skillId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}) {
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!VERSION_PATTERN.test(version)) {
      toast.error("version 必须为 semver 或上游 tag 字符");
      return;
    }
    if (!file) {
      toast.error("请选择 ZIP 文件");
      return;
    }
    setSubmitting(true);
    try {
      // 走 IPC gateway,后端统一负责鉴权、HTTPS 校验和 multipart 拼装(AGENTS.md §4.1 / §7)。
      const zipBytes = await fileToBytesAsync(file);
      const res = await publishSkillVersion({
        skillId,
        version,
        changelog: changelog || undefined,
        zipBytes,
      });
      if (res.status >= 400) {
        let msg = "上传失败";
        try {
          const parsed = JSON.parse(res.body) as { message?: string };
          msg = parsed.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      toast.success("版本发布成功");
      setVersion(""); setChangelog(""); setFile(null);
      onPublished();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发布新版本</DialogTitle>
          <DialogDescription>上传 ZIP 文件并填写版本号。ZIP 顶层必须含 SKILL.md.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>版本号</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">仅字母、数字、点、下划线、连字符,最长 64 字符,如 1.0.0</p>
          </div>
          <div className="grid gap-1.5">
            <Label>变更说明</Label>
            <Textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              rows={2}
              placeholder="可选"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>ZIP 文件</Label>
            <Input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            <FileUp /> 发布
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

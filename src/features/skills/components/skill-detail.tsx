"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileUp, History, Loader2, Package, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { readableError } from "@/features/skills/components/skill-row";
import { publishSkillVersion, fileToBytesAsync } from "@/features/skills/api";
import type { Skill, SkillVersion } from "@/lib/contracts";
import { toast } from "sonner";

const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Skill 详情页:展示元数据 + 版本列表,支持发布新版本与删除。
 */
export function SkillDetail({ id }: { id: string }) {
  const router = useRouter();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, vs] = await Promise.all([api.getSkill(id), api.listSkillVersions(id)]);
      setSkill(s);
      setVersions(vs);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // 进入页面时拉一次首屏;refresh 内部 setState 走 then() 链。
  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const handleDelete = async () => {
    if (!skill) return;
    if (!window.confirm(`确认删除 "${skill.name}"?此操作不可恢复。`)) return;
    try {
      await api.deleteSkill(skill.id);
      toast.success("skill 已删除");
      router.push("/skills");
    } catch (err) {
      toast.error(readableError(err));
    }
  };

  const handleCheckUpdate = async () => {
    try {
      await api.triggerSkillCheckUpdate(id);
      toast.success("已触发上游检查");
      void refresh();
    } catch (err) {
      toast.error(readableError(err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" /> 加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!skill) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/skills")}>
          <ArrowLeft /> 返回
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package className="size-5 shrink-0" />
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {skill.displayName || skill.name}
            </h2>
            {skill.hasUpdateAvailable && <Badge variant="destructive">有更新</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{skill.name}</code>
            {skill.latestVersion && (
              <span className="ml-2">v{skill.latestVersion}</span>
            )}
          </p>
          {skill.description && (
            <p className="mt-2 text-sm text-muted-foreground">{skill.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCheckUpdate}>
            <RefreshCw /> 检查更新
          </Button>
          <Button onClick={() => setPublishOpen(true)}>
            <FileUp /> 发布版本
          </Button>
          <Button variant="ghost" onClick={handleDelete} aria-label="删除">
            <Trash2 />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="size-4" />
            <CardTitle className="text-base">版本历史</CardTitle>
            <CardDescription className="ml-auto">{versions.length} 个版本</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有任何版本。点 &quot;发布版本&quot; 上传首个 ZIP。</p>
          ) : (
            <div className="flex flex-col divide-y">
              {versions.map((v) => (
                <VersionRow key={v.id} version={v} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PublishVersionDialog
        skillId={id}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={() => {
          setPublishOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

function VersionRow({ version }: { version: SkillVersion }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">v{version.version}</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(version.sizeBytes)} · {new Date(version.publishedAt).toLocaleString("zh-CN")}
          {version.changelog && <span className="ml-2">· {version.changelog}</span>}
        </div>
      </div>
      {version.downloadUrl && (
        <Button size="sm" variant="outline" asChild>
          <a href={version.downloadUrl} target="_blank" rel="noopener noreferrer">
            <Download /> 下载
          </a>
        </Button>
      )}
    </div>
  );
}

function PublishVersionDialog({
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
            <p className="text-xs text-muted-foreground">^[A-Za-z0-9._-]&#123;1,64&#125;$</p>
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}


"use client";

import { useState } from "react";
import { Code, FileArchive, Globe, Loader2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiClientError } from "@/lib/api-client";
import { toast } from "sonner";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/**
 * 导入 skill 对话框,3 路入口:GitHub / skills.sh / 本地 ZIP。
 * 服务端 import/github 与 import/skills-sh 当前为 MVP 占位,会返回 SKILL_SOURCE_FETCH_FAILED。
 */
export function ImportSkillDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [tab, setTab] = useState<"github" | "skills-sh" | "zip">("github");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 skill</DialogTitle>
          <DialogDescription>从 GitHub、skills.sh 或本地 ZIP 拉取。</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="github"><Code /> GitHub</TabsTrigger>
            <TabsTrigger value="skills-sh"><Globe /> skills.sh</TabsTrigger>
            <TabsTrigger value="zip"><FileArchive /> ZIP</TabsTrigger>
          </TabsList>
          <TabsContent value="github">
            <GithubForm
              submitting={submitting}
              setSubmitting={setSubmitting}
              onDone={onImported}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
          <TabsContent value="skills-sh">
            <SkillsShForm
              submitting={submitting}
              setSubmitting={setSubmitting}
              onDone={onImported}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
          <TabsContent value="zip">
            <ZipForm
              submitting={submitting}
              setSubmitting={setSubmitting}
              onDone={onImported}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function GithubForm({
  submitting, setSubmitting, onDone, onClose,
}: {
  submitting: boolean; setSubmitting: (b: boolean) => void;
  onDone: () => void; onClose: () => void;
}) {
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("");
  const submit = async () => {
    if (!REPO_PATTERN.test(repo)) {
      toast.error("repo 格式必须为 owner/repo");
      return;
    }
    setSubmitting(true);
    try {
      await api.importSkillFromGithub({ repo, ref: ref || undefined });
      toast.success("GitHub 导入成功");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label>仓库( owner/repo )</Label>
        <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="anthropics/skills" disabled={submitting} />
      </div>
      <div className="grid gap-1.5">
        <Label>分支 / tag(可选)</Label>
        <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="main" disabled={submitting} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          <Download /> 导入
        </Button>
      </DialogFooter>
    </div>
  );
}

function SkillsShForm({
  submitting, setSubmitting, onDone, onClose,
}: {
  submitting: boolean; setSubmitting: (b: boolean) => void;
  onDone: () => void; onClose: () => void;
}) {
  const [slug, setSlug] = useState("");
  const submit = async () => {
    if (!slug.trim()) { toast.error("请填写 slug"); return; }
    setSubmitting(true);
    try {
      await api.importSkillFromSkillsSh({ slug: slug.trim() });
      toast.success("skills.sh 导入成功");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label>slug</Label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-skill" disabled={submitting} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          <Download /> 导入
        </Button>
      </DialogFooter>
    </div>
  );
}

function ZipForm({
  submitting, setSubmitting, onDone, onClose,
}: {
  submitting: boolean; setSubmitting: (b: boolean) => void;
  onDone: () => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const submit = async () => {
    if (!file) { toast.error("请选择 ZIP 文件"); return; }
    if (!NAME_PATTERN.test(name)) {
      toast.error("名称必须小写字母/数字/连字符,以字母或数字开头,最长 64 字符");
      return;
    }
    setSubmitting(true);
    try {
      await api.importSkillFromZip(file, name);
      toast.success("ZIP 导入成功");
      setName(""); setFile(null);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label>ZIP 文件</Label>
        <Input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
        {file && <p className="text-xs text-muted-foreground">已选:{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
      </div>
      <div className="grid gap-1.5">
        <Label>名称(全局唯一)</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-skill" disabled={submitting} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          <Upload /> 导入
        </Button>
      </DialogFooter>
    </div>
  );
}

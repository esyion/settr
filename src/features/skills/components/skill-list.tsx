"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Download, Loader2, Package, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";
import { toast } from "sonner";
import { CreateSkillDialog } from "@/features/skills/components/create-skill-dialog";
import { ImportSkillDialog } from "@/features/skills/components/import-skill-dialog";

/**
 * Skill 列表主组件:展示当前用户可见 skill、支持搜索/创建/导入/删除。
 * 服务端授权:依赖 (app)/layout 的全局鉴权。
 */
export function SkillList() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listSkills({ q: query.trim() || undefined, size: 100 });
      setSkills(result.records);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (skill: Skill) => {
    if (!window.confirm(`确认删除 "${skill.name}"?此操作不可恢复。`)) return;
    try {
      await api.deleteSkill(skill.id);
      toast.success("skill 已删除");
      void refresh();
    } catch (err) {
      toast.error(readableError(err));
    }
  };
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Skills</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">管理你的 Skill 集合</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            服务端存储 ZIP + 版本,客户端分发到本地 AI harness(Claude/Codex/OpenCode 等)。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download /> 导入
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> 新建
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按名称或描述搜索"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" /> 加载中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
            <Package className="size-10" />
            <p>还没有 skill。点 “新建” 创建一个,或 “导入” 从 ZIP / GitHub 拉取。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onOpen={() => router.push(`/skills?id=${encodeURIComponent(skill.id)}`)}
              onDelete={() => handleDelete(skill)}
            />
          ))}
        </div>
      )}

      <CreateSkillDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          void refresh();
        }}
      />
      <ImportSkillDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          setImportOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

function SkillCard({ skill, onOpen, onDelete }: { skill: Skill; onOpen: () => void; onDelete: () => void }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 shrink-0" />
              <span className="truncate">{skill.displayName || skill.name}</span>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2 text-xs">
              {skill.description || `(${skill.name})`}
            </CardDescription>
          </div>
          {skill.hasUpdateAvailable && (
            <Badge variant="destructive" className="shrink-0">有更新</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>来源:{sourceTypeLabel(skill.sourceType)}</span>
          <span>{skill.latestVersion ? `v${skill.latestVersion}` : "无版本"}</span>
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onOpen}>
            详情
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="删除">
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function sourceTypeLabel(type: Skill["sourceType"]): string {
  switch (type) {
    case "local": return "本地";
    case "github": return "GitHub";
    case "skills_sh": return "skills.sh";
    case "zip_upload": return "ZIP 上传";
  }
}

function readableError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "未知错误";
}

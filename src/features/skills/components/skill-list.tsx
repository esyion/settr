"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Search, Upload, Sparkles } from "lucide-react";

// AGENTS.md §4.1 / §8:必须优先组合 shadcn/ui 组件
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";
import { toast } from "sonner";
import { CreateSkillDialog } from "@/features/skills/components/create-skill-dialog";
import { ImportSkillDialog } from "@/features/skills/components/import-skill-dialog";

import type { HarnessKey } from "@/features/skills/skill-harness";
import {
  readLocalSkillState,
  enableSkillHarness,
  disableSkillHarness,
} from "@/features/skills/api";
import { HARNESS_LIST, HARNESS_META, type LocalState } from "@/features/skills/skill-harness";
import { SkillRow, HarnessChip, readableError } from "@/features/skills/components/skill-row";
/**
 * Skill 列表(行/表格式,非卡片)。
 * 布局对齐 cc-switch:
 *  - 顶部:左 "已安装" + 右动作(从 ZIP 安装 / 新建);次行:harness 计数 chips + 检查更新
 *  - 主体:每行一个 skill(左 name + 来源 + 描述,右 7 个 harness Toggle + 编辑/删除)
 *  - harness 切换:对齐 cc-switch 的 AppToggleGroup;Toggle 来自 shadcn/ui
 */
export function SkillList() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [localState, setLocalState] = useState<LocalState>({});
  const [harnessFilter, setHarnessFilter] = useState<HarnessKey | "all">("all");
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listSkills({
        q: query.trim() || undefined,
        size: 100,
      });
      setSkills(result.records);
      try {
        if (typeof window !== "undefined") {
          const snap = await readLocalSkillState();
          setLocalState((snap.skills ?? {}) as LocalState);
        }
      } catch {
        setLocalState({});
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  // 进入页面时拉一次首屏数据;refresh 内部状态变更走 then() 链而非同步 setState。
  useEffect(() => {
    void Promise.resolve().then(() => refresh());
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

  const handleToggleHarness = async (
    skill: Skill,
    harness: HarnessKey,
    enabled: boolean,
  ) => {
    const key = `${skill.id}:${harness}`;
    setToggling((prev) => ({ ...prev, [key]: true }));
    setLocalState((prev) => {
      const cur: Set<string> = new Set(prev[skill.id]?.enabledHarnesses ?? []);
      if (enabled) cur.add(harness);
      else cur.delete(harness);
      return { ...prev, [skill.id]: { enabledHarnesses: Array.from(cur) } };
    });
    try {
      if (typeof window === "undefined") {
        throw new Error("请在桌面客户端中切换 harness");
      }
      if (enabled) {
        await enableSkillHarness(skill.id, harness);
        toast.success(`已分发给 ${HARNESS_META[harness].label}`);
      } else {
        await disableSkillHarness(skill.id, skill.name, harness);
        toast.success(`已从 ${HARNESS_META[harness].label} 移除`);
      }
    } catch (err) {
      setLocalState((prev) => {
        const cur: Set<string> = new Set(prev[skill.id]?.enabledHarnesses ?? []);
        if (enabled) cur.delete(harness);
        else cur.add(harness);
        return { ...prev, [skill.id]: { enabledHarnesses: Array.from(cur) } };
      });
      toast.error(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setToggling((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
    }
  };

  // 计算每个 harness 启用的 skill 数(用于顶部 chips 计数)
  const harnessCounts: Record<HarnessKey, number> = {
    claude: 0,
    codex: 0,
    gemini: 0,
    grokbuild: 0,
    opencode: 0,
    hermes: 0,
    pi: 0,
  };
  for (const entry of Object.values(localState)) {
    for (const h of entry.enabledHarnesses) {
      if (h in harnessCounts) harnessCounts[h as HarnessKey] += 1;
    }
  }

  const visible =
    harnessFilter === "all"
      ? skills
      : skills.filter((s) => s.id && (localState[s.id]?.enabledHarnesses ?? []).includes(harnessFilter));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">已安装</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload /> 从 ZIP 安装
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> 新建
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <HarnessChip
            active={harnessFilter === "all"}
            label="全部"
            count={skills.length}
            onClick={() => setHarnessFilter("all")}
            Icon={Package}
          />
          {HARNESS_LIST.map((h) => {
            const meta = HARNESS_META[h];
            return (
              <HarnessChip
                key={h}
                active={harnessFilter === h}
                label={meta.label}
                count={harnessCounts[h]}
                tone={
                  harnessFilter === h ? meta.enabledClass : "border-transparent"
                }
                onClick={() => setHarnessFilter(h)}
                Icon={meta.Icon}
              />
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <Sparkles /> 检查更新
        </Button>
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
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="px-4 py-3 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Package className="size-8" />
            <p>
              还没有 skill。点 &quot;新建&quot; 创建一个,或 &quot;从 ZIP
              安装&quot; 拉取。
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y">
            {visible.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                enabledHarnesses={new Set(localState[skill.id]?.enabledHarnesses ?? [])}
                toggling={toggling}
                onToggleHarness={(h, e) =>
                  void handleToggleHarness(skill, h, e)
                }
                onOpen={() => router.push(`/skills?id=${skill.id}`)}
                onDelete={() => void handleDelete(skill)}
              />
            ))}
          </ul>
        </Card>
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

export { readableError } from "@/features/skills/components/skill-row";
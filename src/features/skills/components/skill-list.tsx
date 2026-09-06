"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
  Sparkles,
  Pencil,
} from "lucide-react";
import {
  Claude,
  Codex,
  Gemini,
  Grok,
  OpenCode,
  HermesAgent,
  Pi,
} from "@lobehub/icons";

// AGENTS.md §4.1 / §8:必须优先组合 shadcn/ui 组件
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiClientError } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";
import { toast } from "sonner";
import { CreateSkillDialog } from "@/features/skills/components/create-skill-dialog";
import { ImportSkillDialog } from "@/features/skills/components/import-skill-dialog";

/** harness 标识(对齐后端 HarnessId 枚举)。 */
type HarnessKey =
  | "claude"
  | "codex"
  | "gemini"
  | "grokbuild"
  | "opencode"
  | "hermes"
  | "pi";
const HARNESS_LIST: HarnessKey[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "hermes",
  "pi",
];

type HarnessIcon = React.ComponentType<{ size?: number; className?: string }>;
const HARNESS_META: Record<
  HarnessKey,
  { label: string; tone: string; Icon: HarnessIcon; enabledClass: string }
> = {
  claude: {
    label: "Claude",
    Icon: Claude.Color,
    tone: "border-orange-300",
    enabledClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  codex: {
    label: "Codex",
    Icon: Codex.Color,
    tone: "border-emerald-300",
    enabledClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  gemini: {
    label: "Gemini",
    Icon: Gemini.Color,
    tone: "border-sky-300",
    enabledClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  grokbuild: {
    label: "Grok Build",
    Icon: Grok,
    tone: "border-purple-300",
    enabledClass:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  },
  opencode: {
    label: "OpenCode",
    Icon: OpenCode,
    tone: "border-indigo-300",
    enabledClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  hermes: {
    label: "Hermes",
    Icon: HermesAgent,
    tone: "border-rose-300",
    enabledClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  pi: {
    label: "Pi",
    Icon: Pi,
    tone: "border-amber-300",
    enabledClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

type LocalSkillEntry = { enabledHarnesses: string[] };
type LocalState = Record<string, LocalSkillEntry>;

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
        if (
          typeof window !== "undefined" &&
          (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
        ) {
          const { invoke } = await import("@tauri-apps/api/core");
          const snap = (await invoke("read_local_skill_state")) as {
            skills?: LocalState;
          };
          setLocalState(snap.skills ?? {});
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      if (
        typeof window === "undefined" ||
        !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      ) {
        throw new Error("请在桌面客户端中切换 harness");
      }
      const { invoke } = await import("@tauri-apps/api/core");
      if (enabled) {
        await invoke("enable_skill_harness", { skillId: skill.id, harness });
        toast.success(`已分发给 ${HARNESS_META[harness].label}`);
      } else {
        await invoke("disable_skill_harness", {
          skillId: skill.id,
          skillName: skill.name,
          harness,
        });
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

function HarnessChip({
  active,
  label,
  count,
  onClick,
  Icon,
  tone = "",
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  Icon: HarnessIcon;
  tone?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? "default" : "outline"}
      size="sm"
      className={`h-7 rounded-full gap-1.5 px-3 text-xs ${tone}`}
    >
      <Icon className="size-3.5" />
      <span className="font-medium">{label}</span>
      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
        {count}
      </Badge>
    </Button>
  );
}

function SkillRow({
  skill,
  enabledHarnesses,
  toggling,
  onToggleHarness,
  onOpen,
  onDelete,
}: {
  skill: Skill;
  enabledHarnesses: Set<string>;
  toggling: Record<string, boolean>;
  onToggleHarness: (harness: HarnessKey, enabled: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const sourceTag = sourceTypeLabel(skill.sourceType);
  return (
    <li className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onOpen}
            className="h-auto truncate p-0 text-base font-semibold text-foreground hover:text-primary"
          >
            {skill.displayName || skill.name}
          </Button>
          {sourceTag && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 font-mono text-[10px]"
            >
              {sourceTag}
            </Badge>
          )}
          {skill.hasUpdateAvailable && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
              有更新
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {skill.description}
          </p>
        )}
        {skill.latestVersion && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            v{skill.latestVersion}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          {HARNESS_LIST.map((h) => {
            const meta = HARNESS_META[h];
            const enabled = enabledHarnesses.has(h);
            const key = `${skill.id}:${h}`;
            const busy = Boolean(toggling[key]);
            const Icon = meta.Icon;
            return (
              <Tooltip key={h}>
                <TooltipTrigger asChild>
                  <Toggle
                    type="button"
                    pressed={enabled}
                    onPressedChange={() => onToggleHarness(h, !enabled)}
                    disabled={busy}
                    aria-label={`${meta.label}: ${enabled ? "已启用" : "未启用"}`}
                    className={`size-7 rounded-md border ${enabled ? meta.enabledClass : "border-transparent"} ${meta.tone}`}
                  >
                    {busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Icon className="size-3.5" />
                    )}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {meta.label}
                  {enabled ? " 已启用" : " 未启用"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onOpen}
                aria-label="编辑"
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">编辑</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onDelete}
                aria-label="删除"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">删除</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

function sourceTypeLabel(type: Skill["sourceType"]): string | null {
  switch (type) {
    case "local":
      return "本地";
    case "github":
      return "github";
    case "skills_sh":
      return "skills.sh";
    case "zip_upload":
      return "zip_upload";
    default:
      return null;
  }
}

function readableError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "未知错误";
}

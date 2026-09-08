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
import { DeleteSkillDialog } from "@/features/skills/components/delete-skill-dialog";

import type { HarnessKey } from "@/features/skills/skill-harness";
import {
  readLocalSkillState,
  enableSkillHarness,
  disableSkillHarness,
} from "@/features/skills/api";
import { HARNESS_LIST, HARNESS_META, type LocalState } from "@/features/skills/skill-harness";
import { countByHarness, filterVisibleSkills } from "@/features/skills/skill-list-select";
import { SkillRow, HarnessChip, readableError } from "@/features/skills/components/skill-row";
import { useSkillStore } from "@/features/skills/store/skill-store";
import { usePendingUpdates } from "@/features/skills/hooks/use-pending-updates";
/**
 * Skill 列表(行/表格式):顶部动作 + harness 计数 chips + 行内 7 harness Toggle。
 * 双态数据源(规格 §6.2):默认读订阅 store(个人态);传入 items/onRefreshOverride
 * 切换为组织态(useOrgSkills),其余渲染/toggle 逻辑两态共用。
 */
export function SkillList(props: {
  /** 传入时覆盖 store 数据(组织态数据源)。 */
  items?: Skill[];
  /** 传入时覆盖列表刷新动作(组织态用 useOrgSkills.refresh)。 */
  onRefreshOverride?: () => void | Promise<void>;
  /** 传入(组织态)时作为列表 loading 态,避免首屏闪烁空态文案。 */
  loading?: boolean;
}) {
  const router = useRouter();
  // 列表数据/请求态在 store:列表页、详情页、顶栏角标共享;hooks 无条件调用,props 仅决定取值。
  const storeSkills = useSkillStore((s) => s.skillList);
  const storeLoading = useSkillStore((s) => s.listLoading);
  const error = useSkillStore((s) => s.listError);
  const setSkillList = useSkillStore((s) => s.setSkillList);
  const setListLoading = useSkillStore((s) => s.setListLoading);
  const setListError = useSkillStore((s) => s.setListError);
  const { reload: reloadPendingUpdates } = usePendingUpdates();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [localState, setLocalState] = useState<LocalState>({});
  const [harnessFilter, setHarnessFilter] = useState<HarnessKey | "all">("all");
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  // 组织态传入 items/loading 时覆盖 store 数据;两态共用后续渲染/过滤逻辑
  const skills = props.items ?? storeSkills;
  const loading = props.items !== undefined ? (props.loading ?? storeLoading) : storeLoading;

  const refresh = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      if (props.onRefreshOverride) {
        // 组织态:列表刷新走 useOrgSkills.refresh
        await props.onRefreshOverride();
      } else {
        // 个人态:订阅列表(创建∪订阅∪组织分发);搜索本地过滤
        const result = await api.listSkillSubscriptions();
        setSkillList(result);
      }
      try {
        if (typeof window !== "undefined") {
          const snap = await readLocalSkillState();
          setLocalState((snap.skills ?? {}) as LocalState);
        }
      } catch {
        setLocalState({});
      }
    } catch (err) {
      setListError(readableError(err));
    } finally {
      setListLoading(false);
    }
  }, [props.onRefreshOverride, setSkillList, setListLoading, setListError]);

  // 进入页面时拉一次首屏数据(个人态);组织态由 useOrgSkills 自行首拉,避免重复请求。
  useEffect(() => {
    if (props.onRefreshOverride) return;
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => refresh());
    }, 300);
    return () => clearTimeout(timer);
  }, [refresh, props.onRefreshOverride]);

  /** 确认对话框点击删除后执行,成功后刷新列表。 */
  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteSkill(pendingDelete.id);
      toast.success("skill 已删除");
      setPendingDelete(null);
      void refresh();
      void reloadPendingUpdates();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setDeleting(false);
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

  // 计算每个 harness 启用的 skill 数(用于顶部 chips 计数),并按关键字与 harness 过滤。
  const harnessCounts = countByHarness(localState);
  const visible = filterVisibleSkills(skills, localState, harnessFilter, query);

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
                onDelete={() => setPendingDelete(skill)}
              />
            ))}
          </ul>
        </Card>
      )}

      <DeleteSkillDialog
        skillName={pendingDelete?.displayName || pendingDelete?.name || ""}
        open={pendingDelete !== null}
        busy={deleting}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={() => void handleDelete()}
      />
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


"use client";

import { useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { usePendingUpdates } from "@/features/skills/hooks/use-pending-updates";

/**
 * 侧边栏 / 顶栏用的"有可用更新"角标。
 * 数据来自 useSkillStore.pendingUpdates：挂载时拉取一次，
 * skills 列表/详情页变更后由调用方触发 usePendingUpdates().reload() 同步刷新。
 * 请求失败静默（失败时角标隐藏，不阻塞主流程）。
 */
export function PendingUpdatesBadge() {
  const { pendingUpdates, pendingLoading, reload } = usePendingUpdates();

  useEffect(() => {
    void reload();
  }, [reload]);

  if (pendingLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        检查中
      </span>
    );
  }
  const count = pendingUpdates.length;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
      <Sparkles className="size-3" />
      {count} 个 skill 有更新
    </span>
  );
}
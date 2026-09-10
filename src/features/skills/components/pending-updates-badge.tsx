"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePendingUpdates } from "@/features/skills/hooks/use-pending-updates";

/**
 * 侧边栏 / 顶栏用的「有可用更新」入口。
 *
 * 数据来自 useSkillStore.pendingUpdates：挂载时拉取一次，
 * skills 列表/详情页变更后由调用方触发 usePendingUpdates().reload() 同步刷新。
 *
 * 点击徽标会打开浮层列出所有待更新 skill，每行跳转到详情页
 * 由用户触发「检查更新」/重新发布版本。请求失败静默
 * （失败时徽标隐藏，不阻塞主流程）。
 */
export function PendingUpdatesBadge() {
  const { pendingUpdates, pendingLoading, reload } = usePendingUpdates();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (pendingLoading && pendingUpdates.length === 0) {
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={`${count} 个 skill 有更新，点击查看`}
        >
          <Sparkles className="size-3" />
          {count} 个 skill 有更新
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle className="text-sm">
            {count} 个 skill 有可用更新
          </PopoverTitle>
          <PopoverDescription>
            点击进入详情页触发「检查更新」，或发布新版本。
          </PopoverDescription>
        </PopoverHeader>
        <ul className="max-h-80 overflow-y-auto py-1">
          {pendingUpdates.map((skill) => (
            <li key={skill.id}>
              <Link
                href={`/skills/${skill.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {skill.displayName || skill.name}
                  </div>
                  {skill.latestVersion && (
                    <div className="text-[10px] text-muted-foreground">
                      当前版本 v{skill.latestVersion}
                    </div>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t px-4 py-2">
          <span className="text-xs text-muted-foreground">
            重新检查所有订阅
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            disabled={pendingLoading}
          >
            <RefreshCw className={pendingLoading ? "animate-spin" : ""} />
            刷新
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

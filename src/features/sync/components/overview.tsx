"use client";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Revision, SyncState } from "@/lib/contracts";
import { LocalFileCard } from "@/features/sync/components/local-file-card";
import { OverviewSummary } from "@/features/sync/components/overview-summary";
import { SyncActionCard } from "@/features/sync/components/sync-action-card";
export function Overview({
  state,
  busy,
  mergeDraft,
  setMergeDraft,
  onRefresh,
  onUpload,
  onApply,
  onStartMerge,
  onResolveMerge,
}: {
  state: SyncState;
  busy: string | null;
  mergeDraft: string | null;
  setMergeDraft: (value: string | null) => void;
  onRefresh: () => Promise<void>;
  onUpload: (message: string) => Promise<void>;
  onApply: (revision?: Revision | null) => Promise<void>;
  onStartMerge: () => void;
  onResolveMerge: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">同步概览</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            控制你的规则文件
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            客户端只读写本机 ~/.agents/AGENTS.md，云端版本通过真实 API 管理。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void onRefresh()}
          disabled={Boolean(busy)}
        >
          <RefreshCw
            className={busy === "refresh" ? "animate-spin" : undefined}
          />
          刷新状态
        </Button>
      </div>
      <OverviewSummary state={state} />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SyncActionCard
          state={state}
          busy={busy}
          mergeDraft={mergeDraft}
          setMergeDraft={setMergeDraft}
          onRefresh={onRefresh}
          onUpload={onUpload}
          onApply={onApply}
          onStartMerge={onStartMerge}
          onResolveMerge={onResolveMerge}
        />
        <LocalFileCard local={state.local} />
      </div>
    </div>
  );
}

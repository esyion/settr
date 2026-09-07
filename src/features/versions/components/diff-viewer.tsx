import dynamic from "next/dynamic";
import { AlertCircle, GitCompareArrows } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { DiffState } from "@/features/versions/hooks/use-revision-diff";

const OPEN_SOURCE_UNIFIED_MODE = 4;
const DiffView = dynamic(
  () => import("@git-diff-view/react").then((module) => module.DiffView),
  { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> },
);

/** Renders the unified diff pane (or its empty / error / loading states). */
export function DiffViewer({
  diffState,
  diffKey,
  formatLabel,
}: {
  diffState: DiffState | null;
  diffKey: string | null;
  formatLabel: string;
}) {
  if (diffState?.key === diffKey && diffState.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Unified Diff 生成失败</AlertTitle>
        <AlertDescription>{diffState.error}</AlertDescription>
      </Alert>
    );
  }
  if (!diffState || diffState.key !== diffKey || diffState.loading || !diffState.file) {
    return <Skeleton className="h-[420px] w-full" />;
  }
  if (diffState.file.additionLength === 0 && diffState.file.deletionLength === 0) {
    return (
      <Empty className="min-h-[420px] border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
          <EmptyTitle>没有差异</EmptyTitle>
          <EmptyDescription>当前本地文件与所选云端版本内容一致。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-1.5">
        <Badge variant="outline">+{diffState.file.additionLength} 行</Badge>
        <Badge variant="outline">-{diffState.file.deletionLength} 行</Badge>
      </div>
      <DiffView
        diffFile={diffState.file}
        diffViewMode={OPEN_SOURCE_UNIFIED_MODE}
        diffViewTheme="light"
        diffViewHighlight
        diffViewWrap
      />
    </div>
  );
}

/** Empty state shown when no local content exists for comparison. */
export function DiffUnavailable({ displayPath }: { displayPath: string }) {
  return (
    <Empty className="min-h-[420px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
        <EmptyTitle>无法比较本地文件</EmptyTitle>
        <EmptyDescription>本机尚未找到可用于比较的 {displayPath}。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
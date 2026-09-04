"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { DiffFile } from "@git-diff-view/file";
import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Download,
  FileText,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api-client";
import type { Revision, SyncState } from "@/lib/contracts";
import { getDocumentFormatConfig } from "@/lib/document-formats";

const OPEN_SOURCE_UNIFIED_MODE = 4;
const DiffView = dynamic(
  () => import("@git-diff-view/react").then((module) => module.DiffView),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[420px] w-full" />,
  },
);

/** Formats a revision timestamp for display. */
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
/** Returns the short display form of a revision hash. */
function shortHash(value: string) {
  return value.replace(/^sha256:/i, "").slice(0, 12);
}

type DiffState = {
  key: string;
  file: DiffFile | null;
  error: string | null;
  loading: boolean;
};

/** Renders the revision timeline, revision content, and restore controls. */
export function Versions({
  state,
  busy,
  onRestore,
}: {
  state: SyncState;
  busy: string | null;
  onRestore: (revisionId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Revision | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [records, setRecords] = useState(state.revisions?.records || []);
  const [page, setPage] = useState(state.revisions?.page || 1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Revision | null>(null);
  const [detailMode, setDetailMode] = useState<"content" | "diff">("content");
  const [diffState, setDiffState] = useState<DiffState | null>(null);
  const formatConfig = getDocumentFormatConfig(state.format);
  const localContent = state.local?.content;
  const diffKey =
    detailMode === "diff" && selected && localContent !== null && localContent !== undefined
      ? `${formatConfig.label}:${selected.id}:${state.local?.contentHash ?? localContent}`
      : null;

  /** Builds and disposes the open-source unified diff when its inputs change. */
  useEffect(() => {
    if (!diffKey || !selected || localContent === null || localContent === undefined) {
      return;
    }
    let active = true;
    let generated: DiffFile | null = null;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setDiffState({ key: diffKey, file: null, error: null, loading: true });
        return import("@git-diff-view/file");
      })
      .then((module) => {
        if (!module || !active) return;
        generated = module.generateDiffFile(
          `local/${formatConfig.label}`,
          localContent,
          `revision/${selected.id}/${formatConfig.label}`,
          selected.content,
          "markdown",
          "markdown",
        );
        generated.initTheme("light");
        generated.init();
        generated.buildUnifiedDiffLines();
        setDiffState({ key: diffKey, file: generated, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          setDiffState({
            key: diffKey,
            file: null,
            error: error instanceof Error ? error.message : "无法生成 Unified Diff",
            loading: false,
          });
        }
      });
    return () => {
      active = false;
      generated?.clear();
    };
  }, [diffKey, formatConfig.label, localContent, selected]);

  /** Loads a revision's full content into the detail pane. */
  async function open(id: string) {
    if (!state.document) return;
    setLoadingId(id);
    try {
      setSelected(await api.revision(state.document.id, id));
      setDetailMode("content");
    } finally {
      setLoadingId(null);
    }
  }
  /** Loads the next page of revision summaries. */
  async function loadMore() {
    if (!state.document || !state.revisions || page >= state.revisions.pages) return;
    setLoadingMore(true);
    try {
      const next = await api.revisions(state.document.id, page + 1, state.revisions.pageSize);
      setRecords((current) => [...current, ...next.records]);
      setPage(next.page);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">版本历史</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          可审计、可恢复的版本链
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          版本摘要和正文均由当前账号的后端版本接口提供。
        </p>
      </div>
      {!state.revisions || state.revisions.records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            后端还没有可展示的版本。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>版本列表</CardTitle>
              <CardDescription>
                共 {state.revisions.total} 个版本
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {records.map((revision) => (
                <button
                  key={revision.id}
                  type="button"
                  onClick={() => void open(revision.id)}
                  className={
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted " +
                    (selected?.id === revision.id
                      ? "border-primary bg-primary/5"
                      : "")
                  }
                >
                  <FileText className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">
                        {revision.message || "未填写版本说明"}
                      </span>
                      {revision.id === state.document?.headRevisionId && (
                        <Badge>head</Badge>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatTime(revision.createdAt)} ·{" "}
                      {shortHash(revision.contentHash)}
                    </span>
                  </span>
                  {loadingId === revision.id && (
                    <RefreshCw className="size-4 animate-spin" />
                  )}
                </button>
              ))}
            </CardContent>
            {state.revisions.pages > page && (
              <CardFooter>
                <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore && <RefreshCw className="animate-spin" />}
                  加载更多
                </Button>
              </CardFooter>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{selected ? "版本详情" : "选择一个版本"}</CardTitle>
              <CardDescription>
                {selected
                  ? formatTime(selected.createdAt) + " · " + selected.id
                  : "查看正文、Unified Diff、恢复或复制内容"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected ? (
                <Tabs
                  value={detailMode}
                  onValueChange={(value) =>
                    setDetailMode(value === "diff" ? "diff" : "content")
                  }
                >
                  <TabsList>
                    <TabsTrigger value="content">
                      <FileText />
                      版本内容
                    </TabsTrigger>
                    <TabsTrigger value="diff">
                      <GitCompareArrows />
                      Unified Diff
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="content" className="pt-3">
                    <Textarea
                      readOnly
                      value={selected.content}
                      className="min-h-[420px]"
                      aria-label="版本正文"
                    />
                  </TabsContent>
                  <TabsContent value="diff" className="pt-3">
                    {localContent === null || localContent === undefined ? (
                      <Empty className="min-h-[420px] border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <GitCompareArrows />
                          </EmptyMedia>
                          <EmptyTitle>无法比较本地文件</EmptyTitle>
                          <EmptyDescription>
                            本机尚未找到可用于比较的 {formatConfig.displayPath}。
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : diffState?.key === diffKey && diffState.error ? (
                      <Alert variant="destructive">
                        <AlertCircle />
                        <AlertTitle>Unified Diff 生成失败</AlertTitle>
                        <AlertDescription>{diffState.error}</AlertDescription>
                      </Alert>
                    ) : diffState?.key !== diffKey || diffState.loading || !diffState.file ? (
                      <Skeleton className="h-[420px] w-full" />
                    ) : diffState.file.additionLength === 0 &&
                      diffState.file.deletionLength === 0 ? (
                      <Empty className="min-h-[420px] border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <GitCompareArrows />
                          </EmptyMedia>
                          <EmptyTitle>没有差异</EmptyTitle>
                          <EmptyDescription>
                            当前本地文件与所选云端版本内容一致。
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <div className="overflow-hidden rounded-lg border">
                        <div className="flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-2">
                          <Badge variant="outline">
                            +{diffState.file.additionLength} 行
                          </Badge>
                          <Badge variant="outline">
                            -{diffState.file.deletionLength} 行
                          </Badge>
                        </div>
                        <DiffView
                          diffFile={diffState.file}
                          diffViewMode={OPEN_SOURCE_UNIFIED_MODE}
                          diffViewTheme="light"
                          diffViewHighlight
                          diffViewWrap
                        />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                  从左侧选择版本
                </div>
              )}
            </CardContent>
            {selected && (
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setRestoreTarget(selected)}
                  disabled={Boolean(busy)}
                >
                  <Download />
                  恢复为新版本
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard?.writeText(selected.content)
                  }
                >
                  <Copy />
                  复制内容
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      )}
      <AlertDialog open={Boolean(restoreTarget)} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><AlertTriangle className="text-amber-500" /></AlertDialogMedia>
            <AlertDialogTitle>确认恢复此版本？</AlertDialogTitle>
            <AlertDialogDescription>
              恢复会创建一个新的云端版本，并覆盖本地 {formatConfig.displayPath}。覆盖前会自动创建备份，此操作不可直接撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoreTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (restoreTarget) void onRestore(restoreTarget.id); setRestoreTarget(null); }}>确认恢复</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

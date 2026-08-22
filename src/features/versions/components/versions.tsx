"use client";

import { useState } from "react";
import { Copy, Download, FileText, RefreshCw } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { Revision, SyncState } from "@/lib/contracts";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
function shortHash(value: string) {
  return value.replace(/^sha256:/i, "").slice(0, 12);
}

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
  async function open(id: string) {
    if (!state.document) return;
    setLoadingId(id);
    try {
      setSelected(await api.revision(state.document.id, id));
    } finally {
      setLoadingId(null);
    }
  }
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
              <CardTitle>{selected ? "版本内容" : "选择一个版本"}</CardTitle>
              <CardDescription>
                {selected
                  ? formatTime(selected.createdAt) + " · " + selected.id
                  : "查看正文、恢复或复制内容"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected ? (
                <Textarea
                  readOnly
                  value={selected.content}
                  className="min-h-[420px]"
                  aria-label="版本正文"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                  从左侧选择版本
                </div>
              )}
            </CardContent>
            {selected && (
              <CardFooter className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void onRestore(selected.id)}
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
    </div>
  );
}

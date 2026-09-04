import { useState } from "react";
import { Copy, Download, RefreshCw, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Revision, SyncState } from "@/lib/contracts";
import { getDocumentFormatConfig } from "@/lib/document-formats";
export function SyncActionCard({
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
  const [message, setMessage] = useState("");
  const isBusy = Boolean(busy);
  const primary = async () => {
    if (state.status === "localModified") return onUpload(message);
    if (state.status === "remoteModified") return onApply();
    if (state.status === "conflict") return onStartMerge();
    return onRefresh();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>同步操作</CardTitle>
        <CardDescription>
          上传创建不可变版本；冲突时不会覆盖本地文件。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(state.status === "initialChoice" || state.status === "localOnly") && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <p className="font-medium">首次绑定需要明确选择</p>
            <p className="mt-1 text-muted-foreground">
              选择上传本地文件，或应用云端版本。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void onUpload(
                    `首次绑定：上传本地 ${getDocumentFormatConfig(state.format).label}`,
                  )
                }
                disabled={isBusy}
              >
                <Upload />
                上传本地文件
              </Button>
              <Button
                variant="outline"
                onClick={() => void onApply()}
                disabled={isBusy || !state.head}
              >
                <Download />
                应用云端文件
              </Button>
            </div>
          </div>
        )}
        {state.status === "conflict" && !mergeDraft && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">
              本地和云端都发生了修改
            </p>
            <p className="mt-1 text-muted-foreground">
              生成三方合并预览，确认后才会写入和提交。
            </p>
            <Button
              className="mt-3"
              variant="destructive"
              onClick={onStartMerge}
              disabled={isBusy}
            >
              <Copy />
              生成合并预览
            </Button>
          </div>
        )}
        {mergeDraft !== null && (
          <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div>
              <p className="font-medium">合并结果预览</p>
              <p className="mt-1 text-sm text-muted-foreground">
                检查冲突标记后再提交。
              </p>
            </div>
            <Textarea
              value={mergeDraft}
              onChange={(event) => setMergeDraft(event.target.value)}
              aria-label="合并结果"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void onResolveMerge()}
                disabled={isBusy || !mergeDraft.trim()}
              >
                <Save />
                提交合并版本
              </Button>
              <Button
                variant="ghost"
                onClick={() => setMergeDraft(null)}
                disabled={isBusy}
              >
                取消
              </Button>
            </div>
          </div>
        )}
        {(state.status === "localModified" || state.status === "synced") && (
          <label className="flex flex-col gap-2 text-sm font-medium">
            版本说明
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="说明这次规则变更"
              maxLength={500}
            />
          </label>
        )}
        {state.status !== "initialChoice" && state.status !== "localOnly" && !mergeDraft && (
          <Button
            onClick={() => void primary()}
            disabled={
              isBusy || (state.status === "remoteModified" && !state.head)
            }
          >
            {isBusy ? (
              <RefreshCw className="animate-spin" />
            ) : state.status === "remoteModified" ? (
              <Download />
            ) : state.status === "localModified" ? (
              <Upload />
            ) : state.status === "conflict" ? (
              <Copy />
            ) : (
              <RefreshCw />
            )}
            {busy
              ? "处理中"
              : state.status === "remoteModified"
                ? "应用云端版本"
                : state.status === "localModified"
                  ? "上传本地修改"
                  : state.status === "conflict"
                    ? "开始合并"
                    : "立即同步"}
          </Button>
        )}
        {state.requestId && (
          <p className="text-xs text-muted-foreground">
            最近请求 ID：{state.requestId}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { LocalSnapshot } from "@/lib/contracts";
import {
  formatBytes,
  formatTime,
  shortHash,
} from "@/features/sync/components/overview-summary";
export function LocalFileCard({ local }: { local: LocalSnapshot | null }) {
  return (
    <div className="flex flex-col gap-6">
      {" "}
      <Card>
        <CardHeader>
          <CardTitle>本地文件</CardTitle>
          <CardDescription>
            路径、大小和摘要来自 Rust 本地适配器。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {local?.exists ? (
            <>
              <div className="rounded-lg bg-muted p-4">
                <p className="font-mono text-sm">{local.displayPath}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  UTF-8 · {formatBytes(local.bytes)} · SHA-256{" "}
                  {shortHash(local.contentHash)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  最后修改：{formatTime(local.modifiedAtMs)}
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium">安全写入已启用</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    覆盖前备份、临时文件和本地基线保护。
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-sm">
              <p className="font-medium">本机尚未找到 AGENTS.md</p>
              <p className="mt-1 text-muted-foreground">
                请先在 ~/AGENTS.md 创建文件，或从云端应用版本。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {local?.content && (
        <Card>
          <CardHeader>
            <CardTitle>当前本地内容</CardTitle>
            <CardDescription>
              只读预览。编辑请使用 Agent 编辑器，保存后点击刷新。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={local.content}
              readOnly
              aria-label="当前本地 AGENTS.md"
              className="min-h-[280px]"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

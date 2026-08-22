import { Cloud, Laptop } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SyncState, SyncStatus } from "@/lib/contracts";

export function formatTime(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
export function shortHash(value: string | null | undefined) {
  return value ? value.replace(/^sha256:/i, "").slice(0, 12) : "—";
}
export function statusLabel(status: SyncStatus) {
  return {
    loading: "加载中",
    signedOut: "未登录",
    localOnly: "仅本地文件",
    initialChoice: "等待首次绑定",
    synced: "已同步",
    localModified: "本地有修改",
    remoteModified: "云端有更新",
    conflict: "存在冲突",
    offline: "离线",
    error: "同步错误",
  }[status];
}
export function StatusBadge({ status }: { status: SyncStatus }) {
  const variant =
    status === "synced"
      ? "default"
      : status === "conflict" || status === "error"
        ? "destructive"
        : status === "localModified" ||
            status === "remoteModified" ||
            status === "initialChoice"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

export function OverviewSummary({ state }: { state: SyncState }) {
  const head = state.head;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>同步状态</CardDescription>
          <CardTitle className="text-xl">
            <StatusBadge status={state.status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {state.message || "根据本机文件与云端 head 计算"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>云端 head</CardDescription>
          <CardTitle className="text-xl">
            {head ? shortHash(head.contentHash) : "尚未提交"}
          </CardTitle>
          <CardAction>
            <Cloud className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {head ? formatTime(head.createdAt) : "当前账号还没有版本"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>授权设备</CardDescription>
          <CardTitle className="text-xl">{state.devices.length} 台</CardTitle>
          <CardAction>
            <Laptop className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            当前设备 {state.identity?.deviceName || "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Cloud, Laptop } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes, formatTime, shortHash } from "@/lib/format";
import type { SyncState } from "@/lib/contracts";

// 兼容历史 import：从旧路径继续暴露工具函数，避免外部组件依赖断裂。
export { formatTime, formatBytes, shortHash };

/** 概览页摘要卡片：同步状态、云端 head 和授权设备数量。 */
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
          <CardTitle className="text-xl">
            {state.devices?.length ?? 0} 台
          </CardTitle>
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

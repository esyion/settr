"use client";

import { Badge } from "@/components/ui/badge";
import type { SyncStatus } from "@/lib/contracts";

/** 把同步状态映射为用户可读的中文文案。 */
export function statusLabel(status: SyncStatus): string {
  switch (status) {
    case "loading":
      return "加载中";
    case "signedOut":
      return "未登录";
    case "localOnly":
      return "仅本地文件";
    case "initialChoice":
      return "等待首次绑定";
    case "synced":
      return "已同步";
    case "localModified":
      return "本地有修改";
    case "remoteModified":
      return "云端有更新";
    case "conflict":
      return "存在冲突";
    case "offline":
      return "离线";
    case "error":
      return "同步错误";
  }
}

/**
 * 把同步状态映射到 Badge 视觉变体；保持与其他页面一致的状态颜色语义。
 */
export function statusBadgeVariant(
  status: SyncStatus,
): "default" | "destructive" | "secondary" | "outline" {
  if (status === "synced") return "default";
  if (status === "conflict" || status === "error") return "destructive";
  if (
    status === "localModified" ||
    status === "remoteModified" ||
    status === "initialChoice"
  ) {
    return "secondary";
  }
  return "outline";
}

/**
 * 通用状态徽章：在顶部栏、概览摘要、版本列表中复用。
 */
export function StatusBadge({ status }: { status: SyncStatus }) {
  return (
    <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
  );
}

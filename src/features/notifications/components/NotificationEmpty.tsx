// features/notifications/components/NotificationEmpty.tsx
// 空状态：暂无通知。

"use client";

import { BellOff } from "lucide-react";

/**
 * 通知列表空状态。
 */
export function NotificationEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <BellOff className="size-8" aria-hidden />
      <div>暂无通知</div>
    </div>
  );
}
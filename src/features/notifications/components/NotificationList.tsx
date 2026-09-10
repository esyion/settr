// features/notifications/components/NotificationList.tsx
// 通知列表骨架。

"use client";

import { Button } from "@/components/ui/button";
import { CheckCheck, RefreshCw } from "lucide-react";
import { NotificationListItem } from "./NotificationListItem";
import { NotificationEmpty } from "./NotificationEmpty";
import type { NotificationDto } from "../types";

/**
 * 通知列表骨架：标头 + 单条列表 + 空态/加载/错误占位。
 *
 * <p>符合 pending-updates-badge.tsx 模式：失败静默、徽标不阻塞主流程。
 */
export function NotificationList({
  items,
  unreadCount,
  loading,
  onItemClick,
  onMarkAllRead,
  onRefresh,
}: {
  items: NotificationDto[];
  unreadCount: number;
  loading: boolean;
  onItemClick: (n: NotificationDto) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
}) {
  const hasUnread = unreadCount > 0;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {hasUnread ? `${unreadCount} 条未读` : "全部已读"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={loading}
            aria-label="刷新通知列表"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            刷新
          </Button>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onMarkAllRead()}
              aria-label="全部标记为已读"
            >
              <CheckCheck />
              全部已读
            </Button>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <NotificationEmpty />
      ) : (
        <ul className="max-h-96 overflow-y-auto py-1">
          {items.map((notification) => (
            <li key={notification.id}>
              <NotificationListItem
                notification={notification}
                onClick={onItemClick}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
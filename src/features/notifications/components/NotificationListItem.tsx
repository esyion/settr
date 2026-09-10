// features/notifications/components/NotificationListItem.tsx
// 单条通知渲染：未读圆点 + 标题 + 正文 + 时间。

"use client";

import { Bell } from "lucide-react";
import type { NotificationDto } from "../types";

/**
 * 把 ISO 时间戳渲染成相对时间（如"5 分钟前"）。
 * <p>避免引入 date-fns 依赖 —— 简单实现满足通知列表场景。
 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const delta = Math.max(0, Date.now() - t);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} 个月前`;
  return `${Math.floor(mon / 12)} 年前`;
}

/**
 * 通用通知单条渲染。
 *
 * <p>不感知业务方分类 —— 业务方需要自定义渲染时,直接在外层包装组件；
 * 后续可按 category 注册渲染器,本期只做 INVITATION 一种通知,
 * 默认渲染足够。
 */
export function NotificationListItem({
  notification,
  onClick,
}: {
  notification: NotificationDto;
  onClick?: (n: NotificationDto) => void;
}) {
  const time = relativeTime(notification.createdAt);
  return (
    <button
      type="button"
      onClick={() => onClick?.(notification)}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
      aria-label={notification.title}
    >
      <span className="mt-1 shrink-0">
        {!notification.read ? (
          <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
        ) : (
          <Bell className="size-3.5 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">{notification.title}</div>
          <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
        </div>
        {notification.body && (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {notification.body}
          </div>
        )}
      </div>
    </button>
  );
}
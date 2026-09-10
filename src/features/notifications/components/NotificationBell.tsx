// features/notifications/components/NotificationBell.tsx
// 顶栏通用通知铃铛：徽标 + Popover 列表 + 实时刷新。

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseDeepLink } from "@/lib/deep-link";
import { useNotifications } from "../hooks/use-notifications";
import { useNotificationStream } from "../hooks/use-notification-stream";
import { NotificationList } from "./NotificationList";
import type { NotificationDto } from "../types";

/**
 * 顶栏通用通知铃铛。
 *
 * <ul>
 *   <li>挂载时拉取首屏 + 订阅 push://notify 实时刷新;</li>
 *   <li>窗口不在前台时弹 OS 系统通知;</li>
 *   <li>点击单条：标记已读 + 跳转深链（deepLink 由通知模块保留，业务方控制）。</li>
 * </ul>
 */
export function NotificationBell() {
  const { items, unreadCount, loading, reload, markRead, markAllRead } =
    useNotifications();
  useNotificationStream();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  /**
   * 点击单条通知：先补已读标记，再按深链 kind 跳转应用内部路由。
   *
   * <p>
   * deepLink 形如 agentsplus://accept-invite?token=...，属于 OS 级自定义协议，
   * 不能用 window.location 导航 WebView（自定义协议在 WebView 中行为不可预期，
   * 也会绕过解析校验）。这里复用 deep-link.ts 的 parseDeepLink 做协议、host、
   * token 长度校验，再映射为内部页面路由，与 DeepLinkRouter、(auth) 布局的处理一致；
   * 非法或未知深链静默忽略。
   */
  const handleItemClick = async (notification: NotificationDto) => {
    setOpen(false);
    if (!notification.read) {
      await markRead(notification.id);
    }
    if (!notification.deepLink) return;
    const link = parseDeepLink(notification.deepLink);
    if (link?.kind === "accept-invite") {
      router.replace("/accept-invite?token=" + encodeURIComponent(link.token));
    } else if (link?.kind === "reset-password") {
      router.replace("/reset-password?token=" + encodeURIComponent(link.token));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            unreadCount > 0
              ? `通知（${unreadCount} 条未读）`
              : "通知"
          }
        >
          <Bell className="size-4" aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <NotificationList
          items={items}
          unreadCount={unreadCount}
          loading={loading}
          onItemClick={handleItemClick}
          onMarkAllRead={markAllRead}
          onRefresh={() => void reload()}
        />
      </PopoverContent>
    </Popover>
  );
}
// features/notifications/hooks/use-notifications.ts
// 通知数据源 hook：拉取首屏列表 + 未读数 + 已读操作。

"use client";

import { useCallback, useEffect } from "react";
import { notificationsApi } from "../api";
import { useNotificationStore } from "../store/notification-store";

/**
 * 通知数据源 hook。
 *
 * <ul>
 *   <li>挂载时拉取首屏列表 + 未读数;</li>
 *   <li>暴露 reload / markRead / markAllRead 操作。</li>
 * </ul>
 *
 * <p>请求失败时静默保留旧数据,不阻塞主流程（与 pending-updates 模式一致）。
 */
export function useNotifications() {
  const items = useNotificationStore((s) => s.items);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loading = useNotificationStore((s) => s.loading);
  const error = useNotificationStore((s) => s.error);
  const setItems = useNotificationStore((s) => s.setItems);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const setLoading = useNotificationStore((s) => s.setLoading);
  const setError = useNotificationStore((s) => s.setError);
  const markReadAction = useNotificationStore((s) => s.markRead);
  const markAllReadAction = useNotificationStore((s) => s.markAllRead);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        notificationsApi.list({ limit: 50 }),
        notificationsApi.countUnread(),
      ]);
      setItems(list.items, list.nextCursor);
      setUnreadCount(count.unread);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [setItems, setUnreadCount, setLoading, setError]);

  const markRead = useCallback(
    async (id: string) => {
      markReadAction(id);
      try {
        await notificationsApi.markRead(id);
      } catch (e) {
        // 失败时静默,顶栏徽标乐观更新;下次 reload 自然收敛
        console.warn("markRead failed", e);
      }
    },
    [markReadAction],
  );

  const markAllRead = useCallback(async () => {
    markAllReadAction();
    try {
      await notificationsApi.markAllRead();
    } catch (e) {
      console.warn("markAllRead failed", e);
    }
  }, [markAllReadAction]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, unreadCount, loading, error, reload, markRead, markAllRead };
}
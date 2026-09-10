// features/notifications/store/notification-store.ts
// 通知本地 store：列表 + 未读数 + 加载态 + 偏好。

"use client";

import { create } from "zustand";
import type { NotificationDto, NotificationPreferenceDto } from "../types";

/**
 * 通知本地状态。
 *
 * <ul>
 *   <li>items: 当前页可见通知（按 created_at DESC）;</li>
 *   <li>unreadCount: 未读条数（顶栏徽标 + 列表标头）;</li>
 *   <li>loading / error: 首屏与刷新态;</li>
 *   <li>preference: 通知偏好快照（默认全开，设置页与实时通道共享）。</li>
 * </ul>
 */
export interface NotificationState {
  items: NotificationDto[];
  unreadCount: number;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  preference: NotificationPreferenceDto;
}

interface NotificationActions {
  setItems: (items: NotificationDto[], nextCursor: string | null) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** 写入偏好快照（设置页加载/保存成功、实时通道初拉时调用）。 */
  setPreference: (preference: NotificationPreferenceDto) => void;
  /** 把单条通知标记为已读（同步未读数）。 */
  markRead: (id: string) => void;
  /** 全部标记为已读（同步未读数）。 */
  markAllRead: () => void;
  /** 实时通道到达新通知：合并到本地（已有则忽略），未读数 +1。 */
  pushIncoming: (item: NotificationDto) => void;
  reset: () => void;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loading: false,
  error: null,
  // 与后端 NotificationServiceImpl.DEFAULT_CHANNELS 对齐：读不到偏好时按全开兜底。
  preference: { channels: { email: true, desktop: true }, categories: {} },
};

export const useNotificationStore = create<NotificationState & NotificationActions>(
  (set) => ({
    ...initialState,
    setItems: (items, nextCursor) =>
      set({ items, nextCursor, error: null }),
    setUnreadCount: (count) => set({ unreadCount: count }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setPreference: (preference) => set({ preference }),
    markRead: (id) =>
      set((state) => {
        const next = state.items.map((item) =>
          item.id === id && !item.read
            ? { ...item, read: true, readAt: new Date().toISOString() }
            : item,
        );
        const wasUnread = state.items.some(
          (item) => item.id === id && !item.read,
        );
        return {
          items: next,
          unreadCount: wasUnread
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        };
      }),
    markAllRead: () =>
      set((state) => ({
        items: state.items.map((item) =>
          item.read
            ? item
            : { ...item, read: true, readAt: new Date().toISOString() },
        ),
        unreadCount: 0,
      })),
    pushIncoming: (item) =>
      set((state) => {
        // 幂等：去重
        if (state.items.some((existing) => existing.id === item.id)) {
          return state;
        }
        return {
          items: [item, ...state.items],
          unreadCount: item.read
            ? state.unreadCount
            : state.unreadCount + 1,
        };
      }),
    reset: () => set(initialState),
  }),
);
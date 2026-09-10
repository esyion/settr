// features/notifications/hooks/use-notification-stream.ts
// 通知实时通道 hook：订阅 push://notify 事件，写入本地 store，窗口不在前台时
// 按偏好弹 OS 系统通知；unauthorized 终态接入既有会话刷新生命周期。

"use client";

import { useEffect } from "react";
import {
  onPushNotify,
  onPushNotifyStatus,
  pushSubscribeUser,
  pushUnsubscribeUser,
} from "@/services/push";
import { getApiBaseUrl, refreshAccessToken } from "@/lib/api-request";
import { isTauriRuntime } from "@/lib/tauri";
import { loadSession, onSessionChanged } from "@/lib/session-store";
import { sendSystemNotification } from "@/services/notification";
import { notificationsApi } from "../api";
import { isDesktopChannelEnabled } from "../lib/channel-preference";
import { useNotificationStore } from "../store/notification-store";
import type { NotificationDto } from "../types";

/**
 * 通知实时通道 hook。
 *
 * <ul>
 *   <li>登录态有效期内保持一条用户维度 SSE 连接;</li>
 *   <li>收到 push://notify 时:写入本地 store + 窗口不在前台且偏好放行时弹系统通知;</li>
 *   <li>登出或 token 轮换时重建连接;</li>
 *   <li>unauthorized 终态走既有 refreshAccessToken 自救，不新增断线 UI
 *       （transient 断线由 Rust 指数退避静默自愈）。</li>
 * </ul>
 */
export function useNotificationStream() {
  const pushIncoming = useNotificationStore((s) => s.pushIncoming);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await onPushNotify(async (payload) => {
        // 实时信号仅含摘要，写入本地；详情通过 HTTP 列表按需拉取。
        const incoming: NotificationDto = {
          id: payload.notificationId,
          recipientId: "",
          organizationId: null,
          category: payload.category,
          severity: "INFO",
          title: payload.title,
          body: payload.body,
          payload: {},
          deepLink: payload.deepLink,
          deliveryState: "DELIVERED",
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
        };
        pushIncoming(incoming);
        if (typeof document !== "undefined" && document.hidden) {
          // 偏好在事件到达时读取最新快照，避免闭包过期。
          const preference = useNotificationStore.getState().preference;
          if (!isDesktopChannelEnabled(preference, payload.category)) return;
          try {
            await sendSystemNotification(payload.title, payload.body ?? undefined);
          } catch (e) {
            console.warn("system notification failed", e);
          }
        }
      });
      if (cancelled) {
        unlisten?.();
        unlisten = null;
        return;
      }
    };

    void setup();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [pushIncoming]);

  // unauthorized 终态自救：尝试刷新 token。成功与失败都会经
  // onSessionChanged 广播驱动下方连接生命周期重建/退订（refreshAccessToken
  // 内部失败时已 clearSession），与全局 401 处理同路，不新增 UI。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await onPushNotifyStatus((payload) => {
        if (payload.state === "unauthorized") {
          void refreshAccessToken().catch((e) =>
            console.warn("refresh after push unauthorized failed", e),
          );
        }
      });
    };

    void setup();
    return () => {
      unlisten?.();
    };
  }, []);

  // 偏好初拉：设置页未打开时也能拿到用户已保存的桌面通知开关（失败按默认全开兜底）。
  useEffect(() => {
    let cancelled = false;
    void notificationsApi
      .getPreference()
      .then((next) => {
        if (!cancelled) useNotificationStore.getState().setPreference(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 连接生命周期：登录态有效 + token 变化时对齐
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let currentUnsub: (() => void) | null = null;

    const syncConnection = async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (!session) {
        await pushUnsubscribeUser().catch(() => undefined);
        return;
      }
      const baseUrl = await getApiBaseUrl();
      if (cancelled) return;
      await pushSubscribeUser({
        baseUrl,
        accessToken: session.accessToken,
      }).catch((e) => console.warn("push_subscribe_user failed", e));
    };

    void syncConnection();
    currentUnsub = onSessionChanged(() => {
      void syncConnection();
    });

    return () => {
      cancelled = true;
      currentUnsub?.();
      void pushUnsubscribeUser().catch(() => undefined);
    };
  }, []);
}

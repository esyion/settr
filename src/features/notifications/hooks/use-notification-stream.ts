// features/notifications/hooks/use-notification-stream.ts
// 通知实时通道 hook：订阅 push://notify 事件，写入本地 store，窗口不在前台时弹 OS 系统通知。

"use client";

import { useEffect } from "react";
import {
  onPushNotify,
  pushSubscribeUser,
  pushUnsubscribeUser,
} from "@/services/push";
import { getApiBaseUrl } from "@/lib/api-request";
import { isTauriRuntime } from "@/lib/tauri";
import { loadSession, onSessionChanged } from "@/lib/session-store";
import { sendSystemNotification } from "@/services/notification";
import { notificationsApi } from "../api";
import { useNotificationStore } from "../store/notification-store";
import type { NotificationDto } from "../types";

/**
 * 通知实时通道 hook。
 *
 * <ul>
 *   <li>登录态有效期内保持一条用户维度 SSE 连接;</li>
 *   <li>收到 push://notify 时:写入本地 store + 窗口不在前台弹系统通知;</li>
 *   <li>登出或 token 轮换时重建连接。</li>
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

  // 连接生命周期：登录态有效 + token 变化时对齐
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let sessionVersion = 0;
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
      sessionVersion += 1;
      void syncConnection();
    });

    return () => {
      cancelled = true;
      currentUnsub?.();
      void pushUnsubscribeUser().catch(() => undefined);
    };
  }, []);

  void notificationsApi;
}
"use client";

import { useEffect, useState } from "react";
import { notifyOrgContentChange } from "@/lib/push-bus";
import { getApiBaseUrl } from "@/lib/api-request";
import { loadSession, onSessionChanged } from "@/lib/session-store";
import { isTauriRuntime } from "@/lib/tauri";
import { useWorkspaceStore } from "@/features/context/store";
import {
  onPushChange,
  onPushStatus,
  pushConnect,
  pushDisconnect,
  type PushChangePayload,
} from "@/services/push";

/**
 * 组织推送事件 hook:持有推送连接生命周期,把服务端信号并入数据刷新总线。
 *
 * <ul>
 *   <li>连接时机:激活组织且已登录时连接;切组织重连;切回个人/登出断开;
 *       token 轮换(会话变化)后以新 token 重连;</li>
 *   <li>信号去处:org-change → push-bus(1 秒合并)→ 各数据中枢刷新;
 *       disconnected 状态静默,由 Rust 侧自动退避重连 + 兜底轮询收敛;</li>
 *   <li>非 Tauri 运行时(浏览器预览)完全不启用。</li>
 * </ul>
 */
export function usePushEvents(): void {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  // 会话变化(登录/token 轮换/登出)递增版本号,驱动连接 effect 重跑。
  const [sessionVersion, setSessionVersion] = useState(0);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    return onSessionChanged(() => setSessionVersion((version) => version + 1));
  }, []);

  // 事件桥:push://org-change → 合并总线;push://status 保留订阅以便
  // 后续状态徽标扩展,当前断线由 Rust 自动重连 + 轮询兜底,无需用户干预。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let changeUnlisten: (() => void) | null = null;
    let statusUnlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const changeOff = await onPushChange((payload: PushChangePayload) => {
        notifyOrgContentChange(payload.organizationId);
      });
      const statusOff = await onPushStatus(() => undefined);
      if (cancelled) {
        changeOff();
        statusOff();
        return;
      }
      changeUnlisten = changeOff;
      statusUnlisten = statusOff;
    })();
    return () => {
      cancelled = true;
      changeUnlisten?.();
      statusUnlisten?.();
    };
  }, []);

  // 连接生命周期:组织 + 会话任一变化即对齐连接状态。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    if (!organizationId) {
      void pushDisconnect().catch(() => undefined);
      return;
    }
    void (async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (!session) {
        await pushDisconnect().catch(() => undefined);
        return;
      }
      const baseUrl = await getApiBaseUrl();
      if (cancelled) return;
      await pushConnect({
        baseUrl,
        accessToken: session.accessToken,
        organizationId,
      }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, sessionVersion]);
}

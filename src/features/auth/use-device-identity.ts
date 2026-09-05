import { useEffect, useState } from "react";
import type { DeviceIdentity } from "@/lib/contracts";
import { APP_VERSION } from "@/features/sync/sync-state";
import { loadRuntimeSnapshot } from "@/lib/api-client";
import { isTauriRuntime } from "@/lib/tauri";

export interface DeviceIdentityState {
  status: "loading" | "ready" | "unsupported";
  identity: DeviceIdentity | null;
  error: string | null;
}

/**
 * 仅读取当前设备身份与本机文件快照，不挂载心跳和文件监听副作用。
 * <p>
 * 用于登录 / 注册 / 重置密码等鉴权页面，避免触发 (app) 路由组的全部同步副作用。
 * 浏览器预览环境下返回 status="unsupported" 由页面自行决定如何展示。
 */
export function useDeviceIdentity(): DeviceIdentityState {
  const [state, setState] = useState<DeviceIdentityState>({
    status: "loading",
    identity: null,
    error: null,
  });

  // 仅在该 hook 内部把外部 Tauri 状态同步到 React state，符合 effect 预期用途。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntime()) {
      setState({ status: "unsupported", identity: null, error: null });
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const runtime = await loadRuntimeSnapshot(APP_VERSION, "agentsMd");
        if (cancelled) return;
        setState({ status: "ready", identity: runtime.identity, error: null });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "ready",
          identity: null,
          error: error instanceof Error ? error.message : "读取设备信息失败",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return state;
}

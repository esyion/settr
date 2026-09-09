"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  listenAppDeepLink,
  readCurrentDeepLink,
} from "@/lib/deep-link";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 应用级深链路由器：监听 agentsplus://accept-invite?token= 深链并导航到接受邀请页。
 * <p>
 * 挂载在根布局，覆盖登录前后的所有路由组；接受动作本身由 /accept-invite 页面完成
 * （未登录时页面会引导先登录再回跳）。密码重置深链仍由 (auth) 路由组的布局处理。
 * <p>
 * 冷启动时深链事件可能早于监听器注册，因此额外通过 readCurrentDeepLink 主动拉取一次。
 */
export function DeepLinkRouter() {
  const router = useRouter();

  /**
   * 注册桌面深链监听；浏览器环境直接跳过。收到邀请深链后携带 token 跳转到接受邀请页。
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const current = await readCurrentDeepLink();
        if (!cancelled && current?.kind === "accept-invite") {
          router.replace(
            "/accept-invite?token=" + encodeURIComponent(current.token),
          );
        }
        try {
          unlisten = await listenAppDeepLink((link) => {
            if (cancelled || link?.kind !== "accept-invite") return;
            router.replace(
              "/accept-invite?token=" + encodeURIComponent(link.token),
            );
          });
        } catch {
          // 桌面插件未安装或权限缺失，保持当前页面。
        }
      } catch {
        // 拉取深链失败时忽略，等待下一次运行时事件。
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) {
        try {
          unlisten();
        } catch {
          // 卸载阶段调用方已释放。
        }
      }
    };
  }, [router]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cloud } from "lucide-react";
import { AuthHero } from "@/features/auth/components/auth-hero";
import { isTauriRuntime } from "@/lib/tauri";
import {
  listenResetDeepLink,
  readCurrentDeepLink,
} from "@/lib/deep-link";

/**
 * 鉴权路由组的根布局：左侧展示品牌介绍区，右侧承载登录 / 注册 / 忘记密码 / 重置密码表单。
 * <p>
 * 仅在 Tauri 桌面运行时监听密码重置深链，并把应用跳转到对应页面；
 * 浏览器端或收到非法链接时静默忽略，保持现有页面不动。
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  /**
   * 监听 tauri-plugin-deep-link 派发的密码重置深链，触发时导航到 /reset-password。
   * 冷启动链接通过 readCurrentDeepLink 主动拉取，避免 listener 注册之前丢失。
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const current = await readCurrentDeepLink();
        if (!cancelled && current?.kind === "reset-password") {
          router.replace("/reset-password?token=" + encodeURIComponent(current.token));
        }
        try {
          unlisten = await listenResetDeepLink((link) => {
            if (cancelled) return;
            router.replace(
              "/reset-password?token=" + encodeURIComponent(link.token),
            );
          });
        } catch {
          // 桌面插件未安装或权限缺失，保持当前页面。
        }
      } catch {
        // 非桌面环境或拉取深链失败，忽略即可。
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-xl lg:grid-cols-[1fr_1.1fr]">
        <AuthHero />
        <section className="p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Cloud className="size-5" />
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                AGENTS.md / CLAUDE.md
              </p>
              <h1 className="text-xl font-semibold">Agents Plus</h1>
            </div>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

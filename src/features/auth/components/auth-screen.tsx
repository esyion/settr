"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { Cloud } from "lucide-react";
import { clearSession } from "@/lib/session-store";
import { isTauriRuntime } from "@/lib/tauri";
import {
  listenResetDeepLink,
  readCurrentDeepLink,
} from "@/lib/deep-link";
import type { DeviceIdentity } from "@/lib/contracts";
import { AuthHero } from "@/features/auth/components/auth-hero";
import { AuthFormPanel } from "@/features/auth/components/auth-form-panel";
import { ForgotPasswordPanel } from "@/features/auth/components/forgot-password-panel";
import { ResetPasswordPanel } from "@/features/auth/components/reset-password-panel";
import { toast } from "sonner";

/** 鉴权界面支持的运行模式。 */
type AuthMode = "login" | "register" | "forgot" | "reset";

/**
 * 鉴权界面：登录 / 注册 / 忘记密码 / 重置密码四种模式共用同一外壳。
 * <p>
 * 父组件只需要在用户退出登录后挂载本组件；重置成功后本组件内部完成清会话并切回登录态。
 * 忘记密码与重置密码两种模式不依赖 {@link DeviceIdentity}，可独立工作。
 */
export function AuthScreen({
  identity,
  onAuthenticated,
}: {
  identity: DeviceIdentity | null;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [pendingResetToken, setPendingResetToken] = useState<string | null>(
    null,
  );

  /**
   * 切到重置密码模式并写入待用 token；用于深链回调和直接调用两种入口。
   */
  const enterReset = useCallback((token: string) => {
    setPendingResetToken(token);
    setMode("reset");
  }, []);

  /**
   * 监听来自 tauri-plugin-deep-link 的重置链接，触发时切换到 reset 模式。
   * 同时在挂载时拉取一次冷启动深链，覆盖应用启动时 URL 已到达的场景。
   */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      const current = await readCurrentDeepLink();
      if (cancelled) return;
      if (current && current.kind === "reset-password") {
        enterReset(current.token);
      }
      try {
        unlisten = await listenResetDeepLink((link) => {
          if (cancelled) return;
          enterReset(link.token);
        });
      } catch {
        // 非 Tauri 桌面环境或插件未安装，忽略即可。
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) {
        try {
          unlisten();
        } catch {
          // 卸载时调用方已经释放，吞掉错误即可。
        }
      }
    };
  }, [enterReset]);

  /**
   * 重置密码完成回调：清空本地会话、回到登录态并通过 toast 通知用户。
   */
  async function handleResetSuccess() {
    await clearSession();
    setMode("login");
    setPendingResetToken(null);
    toast.success("密码已更新，请重新登录");
  }

  /**
   * 把任意子模式切回登录态的通用收尾。
   */
  function backToLogin() {
    setMode("login");
    setPendingResetToken(null);
  }

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
                ~/AGENTS.md
              </p>
              <h1 className="text-xl font-semibold">Agents Plus</h1>
            </div>
          </div>
          <AuthHeader mode={mode} identity={identity} />
          {mode === "forgot" ? (
            <ForgotPasswordPanel
              onBack={backToLogin}
              onSent={() => {
                // 邮件发送后保持 forgot 模式，由面板自身展示"已发送"态。
              }}
            />
          ) : mode === "reset" && pendingResetToken ? (
            <ResetPasswordPanel
              token={pendingResetToken}
              onSuccess={() => void handleResetSuccess()}
              onCancel={backToLogin}
            />
          ) : (
            <AuthFormPanel
              identity={identity}
              mode={mode === "register" ? "register" : "login"}
              onSwitchMode={() =>
                setMode((current) =>
                  current === "login" ? "register" : "login",
                )
              }
              onAuthenticated={onAuthenticated}
              onForgotPassword={() => setMode("forgot")}
            />
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * 鉴权界面的标题 / 副标题区域；按模式展示不同的引导文案。
 */
function AuthHeader({
  mode,
  identity,
}: {
  mode: AuthMode;
  identity: DeviceIdentity | null;
}) {
  const isAuthMode = mode === "login" || mode === "register";
  const eyebrow = isAuthMode
    ? mode === "login"
      ? "欢迎回来"
      : "创建账号"
    : "账号恢复";
  const title =
    mode === "login"
      ? "登录到你的同步空间"
      : mode === "register"
        ? "开始跨设备同步"
        : mode === "forgot"
          ? "重置你的登录密码"
          : "设置一个新的登录密码";
  const caption =
    mode === "forgot"
      ? "输入注册邮箱，我们会发送一封带链接的重置邮件"
      : mode === "reset"
        ? "邮件中的重置链接已通过本地校验"
        : identity
          ? "当前设备：" + identity.deviceName + " · " + identity.platform
          : "正在读取当前设备";
  return (
    <div className="mb-8">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

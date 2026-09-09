"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFormPanel } from "@/features/auth/components/auth-form-panel";
import {
  AuthPageShell,
  DesktopRequiredNotice,
} from "@/features/auth/components/auth-page-shell";
import { useDeviceIdentity } from "@/features/auth/use-device-identity";
import { loadSession } from "@/lib/session-store";
import {
  appendReturnUrl,
  safeReturnUrl as pickSafeReturnUrl,
} from "@/lib/safe-return-url";

/**
 * 登录页面。
 * <p>
 * 进入页面时拉取当前设备身份（仅 Tauri 可用），浏览器预览页给出明确提示；
 * 已在会话中的用户会被自动重定向到概览页，避免重复输入凭据。
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageShell eyebrow="欢迎回来" title="登录到你的同步空间" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturnUrl = pickSafeReturnUrl(searchParams.get("returnUrl"));
  // 注册成功但自动登录失败时，注册页携带 notice 参数跳转过来，需向用户说明账号已创建。
  const initialMessage =
    searchParams.get("notice") === "auto-login-failed"
      ? "注册成功，自动登录失败，请重新登录"
      : null;
  const device = useDeviceIdentity();

  // 已登录用户访问 /login 时直接跳到概览页。
  useEffect(() => {
    if (device.status !== "ready" || !device.identity) return;
    let cancelled = false;
    void (async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (session) router.replace(safeReturnUrl ?? "/overview");
    })();
    return () => {
      cancelled = true;
    };
  }, [device.status, device.identity, router, safeReturnUrl]);

  if (device.status === "loading") {
    return <AuthPageShell eyebrow="欢迎回来" title="登录到你的同步空间" />;
  }

  if (device.status === "unsupported" || !device.identity) {
    return <DesktopRequiredNotice action="登录" />;
  }

  return (
    <AuthPageShell
      eyebrow="欢迎回来"
      title="登录到你的同步空间"
      caption={"当前设备：" + device.identity.deviceName + " · " + device.identity.platform}
    >
      <AuthFormPanel
        identity={device.identity}
        mode="login"
        initialMessage={initialMessage}
        // 切到注册页时保留 returnUrl，被邀请人没有账号也不会丢失回跳目标。
        onSwitchMode={() =>
          router.replace(appendReturnUrl("/register", safeReturnUrl))
        }
        onAuthenticated={async () => {
          router.replace(safeReturnUrl ?? "/overview");
        }}
        onForgotPassword={() => router.replace("/forgot-password")}
      />
    </AuthPageShell>
  );
}
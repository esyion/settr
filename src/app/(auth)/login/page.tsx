"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthFormPanel } from "@/features/auth/components/auth-form-panel";
import {
  AuthPageShell,
  DesktopRequiredNotice,
} from "@/features/auth/components/auth-page-shell";
import { useDeviceIdentity } from "@/features/auth/use-device-identity";
import { loadSession } from "@/lib/session-store";

/**
 * 登录页面。
 * <p>
 * 进入页面时拉取当前设备身份（仅 Tauri 可用），浏览器预览页给出明确提示；
 * 已在会话中的用户会被自动重定向到概览页，避免重复输入凭据。
 */
export default function LoginPage() {
  const router = useRouter();
  const device = useDeviceIdentity();

  // 已登录用户访问 /login 时直接跳到概览页。
  useEffect(() => {
    if (device.status !== "ready" || !device.identity) return;
    let cancelled = false;
    void (async () => {
      const session = await loadSession();
      if (cancelled) return;
      if (session) router.replace("/overview");
    })();
    return () => {
      cancelled = true;
    };
  }, [device.status, device.identity, router]);

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
        onSwitchMode={() => router.replace("/register")}
        onAuthenticated={async () => {
          router.replace("/overview");
        }}
        onForgotPassword={() => router.replace("/forgot-password")}
      />
    </AuthPageShell>
  );
}

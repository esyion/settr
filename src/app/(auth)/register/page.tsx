"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFormPanel } from "@/features/auth/components/auth-form-panel";
import {
  AuthPageShell,
  DesktopRequiredNotice,
} from "@/features/auth/components/auth-page-shell";
import { useDeviceIdentity } from "@/features/auth/use-device-identity";
import { safeReturnUrl as pickSafeReturnUrl } from "@/lib/safe-return-url";

/**
 * 注册页面：填写邮箱、密码、确认密码并提交；注册成功后自动登录并跳转到概览页。
 */
export default function RegisterPage() {
  return (
    <Suspense
      fallback={<AuthPageShell eyebrow="创建账号" title="开始跨设备同步" />}
    >
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturnUrl = pickSafeReturnUrl(searchParams.get("returnUrl"));
  const device = useDeviceIdentity();

  if (device.status === "loading") {
    return <AuthPageShell eyebrow="创建账号" title="开始跨设备同步" />;
  }

  if (device.status === "unsupported" || !device.identity) {
    return <DesktopRequiredNotice action="注册" />;
  }

  return (
    <AuthPageShell
      eyebrow="创建账号"
      title="开始跨设备同步"
      caption={"当前设备：" + device.identity.deviceName + " · " + device.identity.platform}
    >
      <AuthFormPanel
        identity={device.identity}
        mode="register"
        onSwitchMode={() => router.replace("/login")}
        onAutoLoginFailed={() =>
          router.replace("/login?notice=auto-login-failed")
        }
        onAuthenticated={async () => {
          router.replace(safeReturnUrl ?? "/overview");
        }}
        onForgotPassword={() => router.replace("/forgot-password")}
      />
    </AuthPageShell>
  );
}
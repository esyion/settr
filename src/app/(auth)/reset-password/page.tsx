"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ResetPasswordPanel } from "@/features/auth/components/reset-password-panel";

/**
 * 重置密码页面：邮件中的 token 通过 ?token=xxx 传入；
 * 缺失或非法 token 时显示占位提示并允许返回登录页。
 *
 * 使用 useSearchParams 必须配合 Suspense，避免 next export 在静态预渲染阶段失败。
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordView />
    </Suspense>
  );
}

function ResetPasswordView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => {
    const value = searchParams.get("token");
    return value && value.trim().length >= 32 && value.trim().length <= 100
      ? value.trim()
      : null;
  }, [searchParams]);

  if (!token) {
    return (
      <div>
        <div className="mb-8">
          <p className="text-sm font-medium text-primary">账号恢复</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            重置链接无效或已过期
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            请重新发起重置邮件，或联系管理员获取新的重置链接。
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => router.replace("/forgot-password")}
        >
          重新发送重置邮件
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">账号恢复</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          设置一个新的登录密码
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          邮件中的重置链接已通过本地校验
        </p>
      </div>
      <ResetPasswordPanel
        token={token}
        onSuccess={() => {
          // 密码更新后跳回登录页，让用户使用新密码重新登录。
          router.replace("/login");
        }}
        onCancel={() => router.replace("/login")}
      />
    </div>
  );
}

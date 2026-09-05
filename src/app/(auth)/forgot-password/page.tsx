"use client";

import { useRouter } from "next/navigation";
import { ForgotPasswordPanel } from "@/features/auth/components/forgot-password-panel";

/**
 * 忘记密码页面：输入邮箱并请求发送重置链接；提交后由面板自身展示"已发送"反馈。
 */
export default function ForgotPasswordPage() {
  const router = useRouter();

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">账号恢复</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          重置你的登录密码
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          输入注册邮箱，我们会发送一封带链接的重置邮件
        </p>
      </div>
      <ForgotPasswordPanel
        onBack={() => router.replace("/login")}
        onSent={() => {
          // 邮件发送后保持当前页面，由面板内部展示"已发送"态。
        }}
      />
    </div>
  );
}

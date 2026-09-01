"use client";

import { useState, type FormEvent } from "react";
import { ChevronLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/api-client";

/**
 * 密码策略：必须满足 12 位以上、含大小写、数字、符号；与后端 PasswordPolicy 保持一致。
 */
function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return "密码至少 12 位";
  if (!/[A-Z]/.test(password)) return "密码必须包含大写字母";
  if (!/[a-z]/.test(password)) return "密码必须包含小写字母";
  if (!/[0-9]/.test(password)) return "密码必须包含数字";
  if (!/[^A-Za-z0-9]/.test(password)) return "密码必须包含特殊字符";
  return null;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

/**
 * 重置密码面板。
 * <p>
 * 由父组件传入邮件中的 token，本组件不关心 token 来源（深链 / 粘贴）。
 * 提交成功后调用 {@link onSuccess}，父组件应清除本地会话并切回登录模式。
 */
export function ResetPasswordPanel({
  token,
  onSuccess,
  onCancel,
}: {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      setMessage(policyError);
      return;
    }
    if (password !== confirm) {
      setMessage("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api.confirmPasswordReset(token, password);
      onSuccess();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4" />
          邮件中的重置链接已通过校验
        </div>
        <p className="mt-1 text-primary/80">
          请设置一个 12 位以上、含大小写字母、数字与符号的新密码。
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium">
        新密码
        <Input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 12 位，含大小写、数字和符号"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        确认新密码
        <Input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="再次输入新密码"
        />
      </label>
      {message && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {message}
        </div>
      )}
      <Button type="submit" className="mt-2 w-full" disabled={busy}>
        {busy ? <RefreshCw className="animate-spin" /> : <ShieldCheck />}
        {busy ? "处理中" : "更新密码"}
      </Button>
      <Button
        type="button"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={onCancel}
      >
        <ChevronLeft className="mr-1 inline size-3.5" />
        返回登录
      </Button>
    </form>
  );
}

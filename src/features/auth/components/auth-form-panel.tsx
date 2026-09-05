"use client";

import { useState, type FormEvent } from "react";
import { Cloud, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/api-client";
import type { DeviceIdentity } from "@/lib/contracts";

/**
 * 把任意 unknown 错误转换成可显示的中文文案。
 *
 * @param error 抛出的未知错误对象
 * @returns 用户可读的提示文案
 */
function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

/**
 * 校验注册模式的密码强度与两次输入一致性;非注册模式直接通过。
 *
 * @param password 待校验的主密码
 * @param confirm 第二次输入的密码
 * @returns 校验失败的原因;通过则返回 null
 */
function validateRegisterPolicy(
  password: string,
  confirm: string,
): string | null {
  if (password !== confirm) return "两次输入的密码不一致";
  if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return "密码至少 12 位，并且必须包含大写字母、小写字母、数字和特殊字符";
  }
  return null;
}

/**
 * 登录 / 注册表单面板。
 * <p>
 * 由 {@link AuthScreen} 挂载,本组件只关心表单状态与提交;忘记密码与重置密码逻辑在其它面板中处理。
 */
export function AuthFormPanel({
  identity,
  mode,
  onSwitchMode,
  onAuthenticated,
  onForgotPassword,
}: {
  identity: DeviceIdentity | null;
  mode: "login" | "register";
  onSwitchMode: () => void;
  onAuthenticated: () => Promise<void>;
  onForgotPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * 处理登录或注册提交;注册模式下先校验密码策略再调用接口。
   */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!identity) {
      setMessage("正在读取设备信息,请稍候");
      return;
    }
    if (mode === "register") {
      const policyError = validateRegisterPolicy(password, confirmPassword);
      if (policyError) {
        setMessage(policyError);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(email.trim(), password);
      }
      await api.login({ email: email.trim(), password, identity });
      await onAuthenticated();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-2 text-sm font-medium">
          邮箱
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <div className="flex flex-col gap-2 text-sm font-medium">
          <div className="flex items-center justify-between">
            <label htmlFor="auth-password">密码</label>
            {mode === "login" && (
              <button
                type="button"
                className="text-xs font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={onForgotPassword}
              >
                忘记密码?
              </button>
            )}
          </div>
          <Input
            id="auth-password"
            type="password"
            required
            minLength={mode === "register" ? 12 : 1}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={
              mode === "register"
                ? "至少 12 位,含大小写、数字和符号"
                : "输入密码"
            }
          />
        </div>
        {mode === "register" && (
          <label className="flex flex-col gap-2 text-sm font-medium">
            确认密码
            <Input
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
            />
          </label>
        )}
        {message && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {message}
          </div>
        )}
        <Button
          type="submit"
          className="mt-2 w-full"
          disabled={busy || !identity}
        >
          {busy ? (
            <RefreshCw className="animate-spin" />
          ) : mode === "login" ? (
            <Cloud />
          ) : (
            <UserPlus />
          )}
          {busy ? "处理中" : mode === "login" ? "登录" : "注册并登录"}
        </Button>
      </form>
      <button
        type="button"
        className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={onSwitchMode}
      >
        {mode === "login" ? (
          <>
            <KeyRound className="mr-1 inline size-3.5" />
            还没有账号?立即注册
          </>
        ) : (
          "已有账号?返回登录"
        )}
      </button>
    </>
  );
}

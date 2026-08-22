"use client";

import { useState, type FormEvent } from "react";
import { Cloud, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  ApiClientError,
  getApiBaseUrl,
  setApiBaseUrl,
} from "@/lib/api-client";
import type { DeviceIdentity } from "@/lib/contracts";

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

export function AuthScreen({
  identity,
  onAuthenticated,
}: {
  identity: DeviceIdentity | null;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!identity) {
      setMessage("正在读取设备信息，请稍候");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }
    if (mode === "register" && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))) {
      setMessage("密码至少 12 位，并且必须包含大写字母、小写字母、数字和特殊字符");
      return;
    }
    setBusy(true);
    try {
      setApiBaseUrl(apiUrl);
      if (mode === "register") await api.register(email.trim(), password);
      await api.login({ email: email.trim(), password, identity });
      await onAuthenticated();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-xl lg:grid-cols-[1fr_1.1fr]">
        <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/10">
                <Cloud className="size-5" />
              </div>
              <div>
                <p className="font-mono text-xs text-primary-foreground/60">
                  ~/.agents/AGENTS.md
                </p>
                <h1 className="text-xl font-semibold">Agents Plus</h1>
              </div>
            </div>
            <h2 className="max-w-sm text-3xl font-semibold leading-tight">
              在每台电脑上，保持同一套 Agent 规则。
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-primary-foreground/70">
              通过真实云端版本链同步本地
              AGENTS.md。每次覆盖都有备份，发生冲突时不会静默丢失内容。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary-foreground/60">
            <ShieldCheck className="size-4" />
            会话凭据保存在系统安全存储中
          </div>
        </section>
        <section className="p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Cloud className="size-5" />
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                ~/.agents/AGENTS.md
              </p>
              <h1 className="text-xl font-semibold">Agents Plus</h1>
            </div>
          </div>
          <div className="mb-8">
            <p className="text-sm font-medium text-primary">
              {mode === "login" ? "欢迎回来" : "创建账号"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {mode === "login" ? "登录到你的同步空间" : "开始跨设备同步"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {identity
                ? "当前设备：" + identity.deviceName + " · " + identity.platform
                : "正在读取当前设备"}
            </p>
          </div>
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
            <label className="flex flex-col gap-2 text-sm font-medium">
              密码
              <Input
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  mode === "register"
                    ? "至少 12 位，含大小写、数字和符号"
                    : "输入密码"
                }
              />
            </label>
            {mode === "register" && (
              <label className="flex flex-col gap-2 text-sm font-medium">
                确认密码
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                />
              </label>
            )}
            <label className="flex flex-col gap-2 text-sm font-medium">
              后端地址
              <Input
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                spellCheck={false}
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
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage(null);
            }}
          >
            {mode === "login" ? "还没有账号？立即注册" : "已有账号？返回登录"}
          </button>
        </section>
      </div>
    </main>
  );
}

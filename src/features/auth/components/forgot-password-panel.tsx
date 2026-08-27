"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/api-client";

/**
 * 重发邮件的默认冷却时间，避免用户反复提交造成邮件轰炸。
 */
const RESEND_COOLDOWN_SECONDS = 60;

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

/**
 * 忘记密码面板：展示输入邮箱和"已发送"两态。
 * <p>
 * 父组件负责决定何时挂载与卸载；本组件只关心内部状态、API 调用和冷却计时。
 */
export function ForgotPasswordPanel({
  onBack,
  onSent,
}: {
  onBack: () => void;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!email.trim()) {
      setMessage("请输入邮箱");
      return;
    }
    setBusy(true);
    try {
      await api.requestPasswordReset(email.trim());
      setSubmitted(email.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
      onSent(email.trim());
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-5" data-testid="forgot-sent">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-primary">
            <Mail className="size-4" />
            重置链接已发出
          </div>
          <p className="mt-2 text-muted-foreground">
            若 {submitted} 已注册，我们已把重置链接发送到该邮箱。 请在 30
            分钟内通过链接设置新密码。
          </p>
        </div>
        {message && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {message}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSubmitted(null);
            setMessage(null);
          }}
          disabled={busy || cooldown > 0}
        >
          {cooldown > 0 ? `重新发送（${cooldown}s）` : "重新发送"}
        </Button>
        <Button
          type="button"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={onBack}
        >
          <ChevronLeft className="mr-1 inline size-3.5" />
          返回登录
        </Button>
      </div>
    );
  }

  return (
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
      {message && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {message}
        </div>
      )}
      <Button type="submit" className="mt-2 w-full" disabled={busy}>
        {busy ? <RefreshCw className="animate-spin" /> : <Mail />}
        {busy ? "发送中" : "发送重置链接"}
      </Button>
      <button
        type="button"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={onBack}
      >
        <ChevronLeft className="mr-1 inline size-3.5" />
        返回登录
      </button>
    </form>
  );
}

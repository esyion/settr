"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, LogIn, Mail, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { membershipsApi } from "@/features/memberships/api";
import { ApiClientError } from "@/lib/api-request";
import { appendReturnUrl } from "@/lib/safe-return-url";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 页面状态机：idle 准备中 / loading 校验中 / success 已加入 /
 * error 业务失败 / auth-required 未登录（引导登录或注册后回跳）。
 */
type AcceptInviteStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "auth-required";

/** 认证失效类错误码：40100 未认证、40101 凭据无效、40102/40103 会话过期，统一引导重新登录。 */
const AUTH_ERROR_CODES = [40100, 40101, 40102, 40103];

/**
 * 接受组织邀请页：
 * <ul>
 *   <li>URL 带 ?token=xxx（也接受桌面深链 agentsplus://accept-invite?token= 跳入）</li>
 *   <li>已登录：调 POST /api/v1/invitations/accept，成功后进入组织</li>
 *   <li>未登录：给出登录 / 注册入口，登录后通过 returnUrl 回到本页继续接受</li>
 *   <li>接受成功后从地址栏剥掉 token，避免刷新后重复接受</li>
 * </ul>
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AcceptInviteContent />
    </Suspense>
  );
}

/**
 * 加载骨架屏。
 */
function Skeleton() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>接受组织邀请</CardTitle>
        <CardDescription>加载中…</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * 接受邀请主流程组件：读取 token、调用接受接口并渲染五种状态。
 */
function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<AcceptInviteStatus>("idle");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // 已接受过的 token：成功后剥掉地址栏 token 会触发 effect 重跑，用它防止重复接受。
  const [acceptedToken, setAcceptedToken] = useState<string | null>(null);

  useEffect(() => {
    // 已成功接受过：地址栏 token 已剥除，保持成功态，不再重复接受或报"链接无效"。
    if (acceptedToken) return;
    // 同步 setState 会在 effect 内触发级联渲染，统一推到微任务后执行。
    const defer = (apply: () => void) => void Promise.resolve().then(apply);
    if (!token) {
      defer(() => {
        setStatus("error");
        setErrorMsg("邀请链接无效");
      });
      return;
    }
    // 浏览器环境无法调用桌面 IPC，明确提示而不是报请求错误。
    if (!isTauriRuntime()) {
      defer(() => {
        setStatus("error");
        setErrorMsg("请在 Agents Plus 桌面应用中打开邀请链接");
      });
      return;
    }
    defer(() => setStatus("loading"));
    membershipsApi
      .acceptInvitation(token)
      .then((res) => {
        setAcceptedToken(token);
        setStatus("success");
        setOrgId(res.organizationId);
        toast.success("已加入组织");
        // token 是一次性凭证，成功后从地址栏移除，避免刷新或分享历史记录时重复接受。
        router.replace("/accept-invite");
      })
      .catch((caught: unknown) => {
        if (
          caught instanceof ApiClientError &&
          AUTH_ERROR_CODES.includes(caught.code)
        ) {
          setStatus("auth-required");
          return;
        }
        setStatus("error");
        setErrorMsg(
          caught instanceof Error && caught.message
            ? caught.message
            : "接受邀请失败",
        );
      });
  }, [token, acceptedToken, router]);

  // 登录 / 注册完成后回到本页继续接受邀请。
  const inviteReturnPath = token
    ? "/accept-invite?token=" + encodeURIComponent(token)
    : "/accept-invite";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" />
          接受组织邀请
        </CardTitle>
        <CardDescription>
          {status === "loading" && "正在校验邀请..."}
          {status === "idle" && "准备中..."}
          {status === "success" && "已成功加入组织"}
          {status === "error" && "邀请处理失败"}
          {status === "auth-required" && "请先登录后接受邀请"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "success" && orgId && (
          <Button
            className="w-full"
            onClick={() => router.push("/organization")}
          >
            <Building2 />
            进入组织
          </Button>
        )}
        {status === "auth-required" && (
          <>
            <p className="text-sm text-muted-foreground">
              接受邀请前需要先登录 Agents Plus
              账号。邀请只对被邀请邮箱有效，请使用邀请邮件中的邮箱登录或注册。
            </p>
            <Button
              className="w-full"
              onClick={() =>
                router.push(appendReturnUrl("/login", inviteReturnPath))
              }
            >
              <LogIn />
              登录后接受邀请
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                router.push(appendReturnUrl("/register", inviteReturnPath))
              }
            >
              <UserPlus />
              注册新账号
            </Button>
          </>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail } from "lucide-react";
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

/**
 * 接受组织邀请页：
 * <ul>
 *   <li>URL 带 ?token=xxx</li>
 *   <li>调 POST /api/v1/invitations/accept</li>
 *   <li>成功 → toast + 跳到 /organization/{id}</li>
 *   <li>失败 → 展示错误信息</li>
 * </ul>
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AcceptInviteContent />
    </Suspense>
  );
}

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

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      void Promise.resolve().then(() => {
        setStatus("error");
        setErrorMsg("邀请链接无效");
      });
      return;
    }
    void Promise.resolve().then(() => setStatus("loading"));
    membershipsApi
      .acceptInvitation(token)
      .then((res) => {
        setStatus("success");
        setOrgId(res.organizationId);
        toast.success("已加入组织");
      })
      .catch((caught: Error) => {
        setStatus("error");
        setErrorMsg(caught.message || "接受邀请失败");
      });
  }, [token]);

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
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "success" && orgId && (
          <Button
            className="w-full"
            onClick={() => router.push("/organization")}
          >
            <Building2 />
            进入组织
          </Button>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </CardContent>
    </Card>
  );
}
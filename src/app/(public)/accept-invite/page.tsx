"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 接受组织邀请页面骨架：T1.6 占位，P5 任务实现完整逻辑。
 */
export default function AcceptInvitePage() {
  const params = useSearchParams();
  const token = params.get("token");

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>接受组织邀请</CardTitle>
      </CardHeader>
      <CardContent>
        {token ? (
          <p className="text-sm text-muted-foreground">
            正在处理邀请(token 校验将在后续任务实现)
          </p>
        ) : (
          <p className="text-sm text-destructive">邀请链接无效</p>
        )}
      </CardContent>
    </Card>
  );
}
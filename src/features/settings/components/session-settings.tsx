"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 会话设置卡片:退出当前账号。
 * <p>
 * 退出动作由容器注入(onLogout);退出后系统安全存储中的会话被清除。
 */
export function SessionSettings({
  busy,
  onLogout,
}: {
  busy: string | null;
  onLogout: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>会话</CardTitle>
        <CardDescription>
          退出后会从系统安全存储中清除当前会话。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          onClick={() => void onLogout()}
          disabled={Boolean(busy)}
        >
          <LogOut />
          退出当前账号
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { LogOut, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DeviceIdentity } from "@/lib/contracts";
export function Settings({
  identity,
  busy,
  onRename,
  onLogout,
}: {
  identity: DeviceIdentity | null;
  busy: string | null;
  onRename: (id: string, name: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [name, setName] = useState(identity?.deviceName || "");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">设置</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          连接与本机偏好
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          后端地址和设备名只保存在本机。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>当前设备</CardTitle>
          <CardDescription>
            {identity?.platform} · {identity?.deviceId}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
          />
          <Button
            onClick={() => identity && void onRename(identity.deviceId, name)}
            disabled={!identity || Boolean(busy)}
          >
            <Save />
            保存设备名
          </Button>
        </CardContent>
      </Card>
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
    </div>
  );
}

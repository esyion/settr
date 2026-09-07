"use client";

import { useState } from "react";
import { Save } from "lucide-react";
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

/**
 * 当前设备设置卡片:展示设备平台与 ID,支持重命名。
 * <p>
 * 重命名动作由容器注入(onRename),组件只负责输入与提交交互。
 */
export function DeviceSettings({
  identity,
  busy,
  onRename,
}: {
  identity: DeviceIdentity | null;
  busy: string | null;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(identity?.deviceName || "");
  return (
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
          aria-label="设备名称"
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
  );
}

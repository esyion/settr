"use client";

import { useState } from "react";
import { Laptop, Save, Settings, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Device } from "@/lib/contracts";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
export function Devices({
  devices,
  currentDeviceId,
  busy,
  onRename,
  onRevoke,
}: {
  devices: Device[] | null;
  currentDeviceId?: string;
  busy: string | null;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">设备管理</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          授权你的电脑
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          撤销设备后，该设备的访问令牌会在服务端失效。
        </p>
      </div>
      {devices && devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">当前账号下还没有授权设备。</p>
      ) : null}
      <div className="grid gap-4">
        {(devices ?? []).map((device, index) => (
          <DeviceCard
            key={(device.deviceId || "") + ":" + index}
            device={device}
            current={device.deviceId === currentDeviceId}
            busy={busy}
            onRename={onRename}
            onRevoke={onRevoke}
          />
        ))}
      </div>
    </div>
  );
}
function DeviceCard({
  device,
  current,
  busy,
  onRename,
  onRevoke,
}: {
  device: Device;
  current: boolean;
  busy: string | null;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(device.deviceName);
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Laptop className="size-5" />
          {device.deviceName}
          {current && <Badge variant="secondary">当前设备</Badge>}
        </CardTitle>
        <CardDescription>
          {device.platform} · Agents Plus {device.appVersion} · 最近在线{" "}
          {formatTime(device.lastSeenAt)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
            <Button
              onClick={async () => {
                await onRename(device.deviceId, name);
                setEditing(false);
              }}
              disabled={busy === "rename:" + device.deviceId}
            >
              <Save />
              保存
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Settings />
              重命名
            </Button>
            {!current && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      "确定撤销设备“" + device.deviceName + "”吗？",
                    )
                  )
                    void onRevoke(device.deviceId);
                }}
                disabled={busy === "revoke:" + device.deviceId}
              >
                <XCircle />
                撤销设备
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

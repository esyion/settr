"use client";

import type { DeviceIdentity } from "@/lib/contracts";
import { AppearanceSettings } from "./appearance-settings";
import { ConnectionSettings } from "./connection-settings";
import { DeviceSettings } from "./device-settings";
import { SessionSettings } from "./session-settings";
import { StartupSettings } from "./startup-settings";

/**
 * 设置页容器:仅负责分组布局,各设置卡片自治(状态与数据加载内聚)。
 * <p>
 * 设备与会话依赖容器注入的同步控制器回调;其余卡片自治读取本机设置。
 */
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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-primary">设置</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          连接与本机偏好
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          外观与启动偏好保存在本机。
        </p>
      </div>
      <AppearanceSettings />
      <StartupSettings />
      <ConnectionSettings />
      <DeviceSettings identity={identity} busy={busy} onRename={onRename} />
      <SessionSettings busy={busy} onLogout={onLogout} />
    </div>
  );
}

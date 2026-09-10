// features/notifications/components/NotificationPreferences.tsx
// 通知偏好设置卡片。

"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNotificationPreference } from "../hooks/use-notification-preference";

/**
 * 通知偏好设置卡片：仅桌面通知开关可配置（邮件默认 true 不可关闭 ——
 * 当前通知通道仅做实时 + 系统通知,邮件字段保留扩展位）。
 */
export function NotificationPreferences() {
  const { preference, loading, update } = useNotificationPreference();
  const [desktop, setDesktop] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDesktop(preference.channels.desktop ?? true);
  }, [preference.channels.desktop]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await update({
        channels: {
          email: true,
          desktop,
        },
      });
      toast.success("通知偏好已保存");
    } catch (e) {
      toast.error("保存失败", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>通知</CardTitle>
        <CardDescription>
          控制桌面通知启用状态。邮件通知字段保留扩展位（当前默认开启）。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch
            id="desktop-notification"
            checked={desktop}
            onCheckedChange={setDesktop}
            disabled={loading || busy}
            aria-label="桌面通知"
          />
          <label
            htmlFor="desktop-notification"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            启用桌面通知
          </label>
        </div>
        <Button onClick={() => void handleSave()} disabled={loading || busy}>
          <Save />
          保存
        </Button>
      </CardContent>
    </Card>
  );
}
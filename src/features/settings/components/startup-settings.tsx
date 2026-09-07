"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { isTauriRuntime } from "@/lib/tauri";
import {
  fetchAllSettings,
  updateCloseToTray,
  updateStartupCheck,
} from "@/features/settings/api";

/**
 * 启动设置卡片:启动检查、关闭到托盘与开机自启动开关。
 * <p>
 * 启动检查与关闭到托盘经 IPC 持久化到用户设置;自启动直接读写系统注册状态。
 * 全部开关失败时回滚并 toast 具体错误,避免 UI 与实际状态不一致。
 */
export function StartupSettings() {
  const [closeToTray, setCloseToTray] = useState(true);
  const [closeToTraySaving, setCloseToTraySaving] = useState(false);
  const [startupCheck, setStartupCheck] = useState(true);
  const [startupCheckSaving, setStartupCheckSaving] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [autostartSaving, setAutostartSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllSettings()
      .then((settings) => {
        if (!cancelled) {
          setCloseToTray(settings.closeToTray);
          setStartupCheck(settings.startupCheck);
        }
      })
      .catch(() => {
        // 失败保持默认值(均为开),用户切换时会得到具体错误。
      });
    if (isTauriRuntime()) {
      isAutostartEnabled()
        .then((enabled) => {
          if (!cancelled) setAutostart(enabled);
        })
        .catch(() => {
          // 读取失败保持 false,用户切换时会得到具体错误。
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 切换"关闭到托盘";失败时回滚开关并提示。
   */
  async function handleCloseToTrayChange(next: boolean) {
    setCloseToTraySaving(true);
    try {
      await updateCloseToTray(next);
      setCloseToTray(next);
      toast.success(next ? "关闭窗口时将最小化到托盘" : "关闭窗口时将直接退出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setCloseToTraySaving(false);
    }
  }

  /**
   * 切换"启动时检查";失败时回滚开关并提示。
   */
  async function handleStartupCheckChange(next: boolean) {
    setStartupCheckSaving(true);
    try {
      await updateStartupCheck(next);
      setStartupCheck(next);
      toast.success(next ? "进入应用时将自动检查云端状态" : "已关闭启动时自动检查");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setStartupCheckSaving(false);
    }
  }

  /**
   * 切换"开机自启动";直接读写系统注册状态,失败时回滚开关。
   */
  async function handleAutostartChange(next: boolean) {
    setAutostartSaving(true);
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      setAutostart(next);
      toast.success(next ? "已开启开机自启动" : "已关闭开机自启动");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存自启动设置失败");
    } finally {
      setAutostartSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>启动</CardTitle>
        <CardDescription>控制启动检查、窗口关闭行为与开机自启动。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">启动时检查</p>
            <p className="text-sm text-muted-foreground">
              进入应用时自动刷新本地与云端状态。
            </p>
          </div>
          <Switch
            checked={startupCheck}
            disabled={startupCheckSaving}
            onCheckedChange={(value) => void handleStartupCheckChange(value)}
            aria-label="启动时检查"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">关闭时最小化到托盘</p>
            <p className="text-sm text-muted-foreground">
              关闭后点击关闭按钮将隐藏到托盘,而非退出应用。
            </p>
          </div>
          <Switch
            checked={closeToTray}
            disabled={closeToTraySaving}
            onCheckedChange={(value) => void handleCloseToTrayChange(value)}
            aria-label="关闭时最小化到托盘"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">开机自启动</p>
            <p className="text-sm text-muted-foreground">
              登录系统后自动启动应用。
            </p>
          </div>
          {autostartSaving ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={autostart}
              onCheckedChange={(value) => void handleAutostartChange(value)}
              aria-label="开机自启动"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

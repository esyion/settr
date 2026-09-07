"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** 主题可选项(值与 next-themes 约定一致)。 */
const THEME_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

/**
 * 外观设置卡片:亮色/暗色/跟随系统三态切换。
 * <p>
 * 主题选择由 next-themes 持久化到本地,组件自身无服务端依赖。
 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const active = theme ?? "system";
  return (
    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
        <CardDescription>选择应用的配色主题。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2" role="group" aria-label="主题选择">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={active === value ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(value)}
              aria-pressed={active === value}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

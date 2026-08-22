"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  FileText,
  History,
  Laptop,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { greetFromRust } from "@/features/sync/api";

const activity = [
  { version: "v12", device: "公司电脑", time: "今天 14:32", action: "更新了 Rust command 规范" },
  { version: "v11", device: "家里电脑", time: "昨天 22:18", action: "恢复了安全规则" },
  { version: "v10", device: "公司电脑", time: "8 月 20 日", action: "首次上传到云端" },
];

export function Dashboard() {
  const [message, setMessage] = useState("尚未连接 Tauri 后端");
  const [isChecking, setIsChecking] = useState(false);

  async function checkConnection() {
    setIsChecking(true);
    try {
      setMessage(await greetFromRust("Agents Plus"));
    } catch {
      setMessage("请使用 npm run tauri dev 启动桌面应用");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Cloud className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-sm text-muted-foreground">~/.agents/AGENTS.md</p>
              <h1 className="text-2xl font-semibold tracking-tight">Agents Plus</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">本地演示</Badge>
            <Button onClick={checkConnection} disabled={isChecking}>
              <RefreshCw className={isChecking ? "animate-spin" : undefined} aria-hidden="true" />
              {isChecking ? "检查中" : "检查 Tauri 连接"}
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3" aria-label="同步概览">
          <Card>
            <CardHeader>
              <CardDescription>同步状态</CardDescription>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
                已同步
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">当前本地文件与云端 v12 保持一致。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>当前版本</CardDescription>
              <CardTitle className="text-xl">v12</CardTitle>
              <CardAction>
                <History className="size-5 text-muted-foreground" aria-hidden="true" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">来自公司电脑 · 今天 14:32</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>已连接设备</CardDescription>
              <CardTitle className="text-xl">2 台</CardTitle>
              <CardAction>
                <Laptop className="size-5 text-muted-foreground" aria-hidden="true" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">公司电脑与家里电脑均已授权。</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>最近版本</CardTitle>
              <CardDescription>每次上传都会创建可恢复的历史版本。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {activity.map((item) => (
                  <div key={item.version} className="flex items-start gap-3 rounded-lg border p-4">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.action}</p>
                        <Badge variant="outline">{item.version}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.device} · {item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline">查看全部版本</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>本地文件</CardTitle>
              <CardDescription>远程更新写入前会创建备份并执行冲突检查。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="font-mono text-sm">~/.agents/AGENTS.md</p>
                <p className="mt-2 text-sm text-muted-foreground">UTF-8 · 13.6 KB · SHA-256 已校验</p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden="true" />
                <div>
                  <p className="font-medium">安全写入已启用</p>
                  <p className="mt-1 text-sm text-muted-foreground">原子替换、覆盖前备份、并发修改保护。</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button>立即同步</Button>
              <p className="text-center text-xs text-muted-foreground" aria-live="polite">{message}</p>
            </CardFooter>
          </Card>
        </section>
      </div>
    </main>
  );
}

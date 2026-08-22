import { Cloud, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StartupState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cloud className="size-6" />
          </div>
          <CardTitle>无法恢复登录状态</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => void onRetry()}>
            <RefreshCw />
            重新检查
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export function DesktopRequiredState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Cloud className="size-6" />
          </div>
          <CardTitle>请使用 Agents Plus 桌面应用</CardTitle>
          <CardDescription>
            Next.js 预览页面不会直接访问本机文件或发送凭据。请运行 npm run tauri
            dev，客户端会通过 Tauri 安全桥接连接真实后端。
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="animate-spin" />
        正在读取本机和后端状态
      </div>
    </main>
  );
}

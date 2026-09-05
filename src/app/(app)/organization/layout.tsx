"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { toast } from "sonner";

/**
 * 组织空间根布局：无 ctx=organization 时 redirect 到 /overview，
 * 并 toast 提示用户。
 */
export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = useWorkspaceContextValue();
  const router = useRouter();

  useEffect(() => {
    if (!ctx.loading && ctx.scope !== "organization") {
      toast.error("请先选择一个组织", {
        description: "侧边栏顶部可切换或创建组织",
      });
      router.replace("/overview");
    }
  }, [ctx.loading, ctx.scope, router]);

  if (ctx.loading || ctx.scope !== "organization") {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">正在加载组织上下文…</p>
      </div>
    );
  }

  return <>{children}</>;
}
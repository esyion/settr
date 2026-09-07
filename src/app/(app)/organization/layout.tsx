"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";

/**
 * 组织空间根布局：
 * <ul>
 *   <li>`/organization` 本身（overview）：两种 scope 都可访问，
 *       由 page.tsx 决定渲染「创建表单」还是「组织概览」；</li>
 *   <li>`/organization/*` 子路由（teams/memberships/...）：
 *       必须已选 ctx=organization，否则 redirect 到 /overview 并 toast。</li>
 * </ul>
 */
export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = useWorkspaceStore();
  const router = useRouter();
  const pathname = usePathname();

  // 子路由守卫：scope !== organization 且不在 /organization 根时 redirect
  useEffect(() => {
    const isRoot = pathname === "/organization";
    if (!ctx.loading && !isRoot && ctx.scope !== "organization") {
      toast.error("请先创建一个组织", {
        description: "点击侧边栏的「组织」进入创建",
      });
      router.replace("/organization");
    }
  }, [ctx.loading, ctx.scope, pathname, router]);

  // 加载中态
  if (ctx.loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">正在加载组织上下文…</p>
      </div>
    );
  }

  return <>{children}</>;
}
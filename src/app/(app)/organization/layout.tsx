"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";

/**
 * 组织空间根布局：
 * <ul>
 *   <li>`/organization` 本身（redirect 中转页）：两种 scope 都允许进入；</li>
 *   <li>`/organization/*` 子路由（teams/memberships/...）：必须已选 ctx=organization，
 *       否则 toast 提示用户通过 WorkspaceSwitcher 创建/切换组织，并降级到 /overview。</li>
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

  // 子路由守卫：仅在子路由（非 /organization 根）触发，避免 redirect 中转页自我死循环。
  useEffect(() => {
    const isRoot = pathname === "/organization";
    if (!ctx.loading && !isRoot && ctx.scope !== "organization") {
      toast.error("请先创建一个组织", {
        description: "点击侧边栏顶部的 WorkspaceSwitcher 创建或切换组织",
      });
      router.replace("/overview");
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
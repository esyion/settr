"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/features/context/store";

/**
 * /organization 根路由：根据当前工作区作用域瞬时跳转。
 * <ul>
 *   <li>organization scope → /organization/teams（组织空间默认落地页）；</li>
 *   <li>personal scope → /overview（不再渲染创建表单；创建组织的入口在 WorkspaceSwitcher）。</li>
 * </ul>
 * 保留此页仅作为兼容旧书签与 /organization 链接的中转站，不承载任何 UI 内容。
 */
export default function OrganizationIndexRedirect() {
  const router = useRouter();
  const ctx = useWorkspaceStore();

  useEffect(() => {
    if (ctx.loading) return;
    router.replace(
      ctx.scope === "organization" ? "/organization/teams" : "/overview",
    );
  }, [ctx.loading, ctx.scope, router]);

  return (
    <div className="flex h-full items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      正在跳转…
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";

/**
 * 侧边栏 / 顶栏用的"有可用更新"角标。
 * 静默调用 /skills/pending-updates;不报错(失败时返回 0)。
 */
export function PendingUpdatesBadge() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const items: Skill[] = await api.listSkillPendingUpdates();
        if (!cancel) setCount(items.length);
      } catch (err) {
        // 静默:角标不阻塞主流程
        if (!(err instanceof ApiClientError)) {
          console.warn("PendingUpdatesBadge refresh failed", err);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        检查中
      </span>
    );
  }
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
      <Sparkles className="size-3" />
      {count} 个 skill 有更新
    </span>
  );
}

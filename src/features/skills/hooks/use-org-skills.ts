"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";

/**
 * 组织空间 skill 列表数据源:GET /skills?scope=org&org_id(规格 §6.2)。
 * 五态:loading / error 供页面渲染 retry;orgId 变化自动重拉。
 *
 * @param orgId 当前组织 ID;为空时不请求(个人空间守卫)
 */
export function useOrgSkills(orgId: string | null) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api.listSkills({ scope: "org", orgId, size: 100 });
      setSkills(page.records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { skills, loading, error, refresh };
}

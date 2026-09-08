"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";

/**
 * 组织空间 skill 列表数据源:GET /skills?scope=ORG&org_id(scope 值须与服务端枚举
 * SkillOwnerScope 的大写常量一致,小写会 400)。
 * 五态:loading / error 供页面渲染 retry;orgId 变化自动重拉;
 * 竞态守卫:响应落地时组织已切换则丢弃。
 *
 * @param orgId 当前组织 ID;为空时不请求(个人空间守卫)
 */
export function useOrgSkills(orgId: string | null) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orgIdRef = useRef(orgId);
  useEffect(() => {
    orgIdRef.current = orgId;
  }, [orgId]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const requestOrgId = orgId;
    setLoading(true);
    setError(null);
    try {
      const page = await api.listSkills({ scope: "ORG", orgId: requestOrgId, size: 100 });
      if (orgIdRef.current !== requestOrgId) return;
      setSkills(page.records);
    } catch (caught) {
      if (orgIdRef.current !== requestOrgId) return;
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

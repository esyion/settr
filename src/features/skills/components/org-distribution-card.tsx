"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiClientError } from "@/lib/api-client";
import { subscribeOrgContentChange } from "@/lib/push-bus";
import type { SkillDistribution } from "@/lib/api-skill";

export interface OrgDistributionCardProps {
  orgId: string;
  /** 是否显示撤回动作(由 canDistributeSkill 能力位决定)。 */
  canWithdraw: boolean;
}

/**
 * 组织 skill 分发记录卡片:列出活跃分发并支持撤回。
 * 五态覆盖:loading/success/empty/error/retry;
 * 竞态守卫:响应落地时组织已切换则丢弃,防止旧组织数据串台。
 */
export function OrgDistributionCard({ orgId, canWithdraw }: OrgDistributionCardProps) {
  const [items, setItems] = useState<SkillDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const orgIdRef = useRef(orgId);
  useEffect(() => {
    orgIdRef.current = orgId;
  }, [orgId]);

  const refresh = useCallback(async () => {
    const requestOrgId = orgId;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listSkillDistributions(requestOrgId);
      if (orgIdRef.current !== requestOrgId) return;
      setItems(list);
    } catch (caught) {
      if (orgIdRef.current !== requestOrgId) return;
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 组织推送信号(skill 分发/撤回)→ 重拉分发列表;非本组织的信号忽略。
  useEffect(
    () =>
      subscribeOrgContentChange((changedOrgId) => {
        if (changedOrgId && changedOrgId !== orgId) return;
        void refresh();
      }),
    [refresh, orgId],
  );

  /** 撤回一条分发,成功后刷新列表;失败展示错误供重试。 */
  const handleWithdraw = async (id: string) => {
    setWithdrawing(id);
    try {
      await api.withdrawSkillDistribution(orgId, id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>组织分发</CardTitle>
        <CardDescription>已分发到组织/团队/成员的 skill 与撤回操作</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loading && error && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <button className="text-sm underline" onClick={() => void refresh()}>
              重试
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无分发</p>
        )}
        {!loading && !error && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {d.scopeType}
                    {d.teamId ? ` · team ${d.teamId}` : ""}
                    {d.memberId ? ` · member ${d.memberId}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">skill {d.skillId}</p>
                </div>
                {canWithdraw && !d.withdrawn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={withdrawing !== null}
                    onClick={() => void handleWithdraw(d.id)}
                  >
                    <Trash2 /> 撤回
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

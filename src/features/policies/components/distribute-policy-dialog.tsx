"use client";

import { useEffect, useState } from "react";
import {
  DistributeDialog,
  type DistributeSubmitInput,
} from "@/components/distribute-dialog";
import { api } from "@/lib/api-client";
import { teamsApi } from "@/features/teams/api";

export interface DistributePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  busy: boolean;
  /** 提交回调;失败由调用方兜底(本组件只负责目标数据加载与载荷转发)。 */
  onSubmit: (input: DistributeSubmitInput) => Promise<void>;
}

/**
 * policy 分发对话框编排:打开时拉取组织团队与活跃成员列表注入
 * 通用 DistributeDialog,提交时转发载荷。目标列表失败时降级为
 * 仅可分发到整个组织,并给出提示。
 */
export function DistributePolicyDialog(props: DistributePolicyDialogProps) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [targetsError, setTargetsError] = useState(false);

  useEffect(() => {
    if (!props.open || !props.organizationId) return;
    let cancelled = false;
    // 打开/换组织时先清空,避免展示上一组织的目标列表
    setTeams([]);
    setMembers([]);
    setTargetsError(false);
    void (async () => {
      try {
        const [teamList, memberList] = await Promise.all([
          teamsApi.listTeams(props.organizationId),
          api.listMemberships(props.organizationId),
        ]);
        if (cancelled) return;
        setTeams(teamList.map((t) => ({ id: t.id, name: t.name })));
        setMembers(
          memberList
            .filter((m) => m.status === "ACTIVE")
            .map((m) => ({ id: m.id, label: `成员 ${m.userId}` })),
        );
      } catch {
        if (!cancelled) setTargetsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.organizationId]);

  return (
    <DistributeDialog
      open={props.open}
      title="分发规范版本"
      busy={props.busy}
      warning={
        targetsError
          ? "目标列表加载失败,暂只能分发到整个组织"
          : undefined
      }
      teams={teams}
      members={members}
      onSubmit={props.onSubmit}
      onOpenChange={props.onOpenChange}
    />
  );
}

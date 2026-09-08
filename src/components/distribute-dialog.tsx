"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 分发作用域(与后端枚举 ORGANIZATION/TEAM/MEMBER 对齐;policy 的 PROJECT 本期不接)。 */
export type DistributeScope = "ORGANIZATION" | "TEAM" | "MEMBER";

/** 提交载荷:scope 决定可选字段。 */
export interface DistributeSubmitInput {
  scopeType: DistributeScope;
  teamId?: string;
  memberId?: string;
}

export interface DistributeDialogProps {
  open: boolean;
  title: string;
  busy: boolean;
  /** 可选团队列表;为空时范围下拉不出现"团队"项。 */
  teams: { id: string; name: string }[];
  /** 可选成员列表;为空时范围下拉不出现"单个成员"项。 */
  members: { id: string; label: string }[];
  /** 提交回调(scope 决定携带的目标字段);请求由调用方发起。 */
  onSubmit: (input: DistributeSubmitInput) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 通用分发对话框:选择作用域(ORG/TEAM/MEMBER)与目标后回调提交。
 * 目标数据由调用方注入(policy/skill 两个入口共用),本组件不发请求。
 */
export function DistributeDialog(props: DistributeDialogProps) {
  const [scope, setScope] = useState<DistributeScope>("ORGANIZATION");
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");

  const canSubmit =
    !props.busy &&
    (scope === "ORGANIZATION" ||
      (scope === "TEAM" && teamId !== "") ||
      (scope === "MEMBER" && memberId !== ""));

  const handleSubmit = () => {
    if (!canSubmit) return;
    props.onSubmit(
      scope === "TEAM"
        ? { scopeType: scope, teamId }
        : scope === "MEMBER"
          ? { scopeType: scope, memberId }
          : { scopeType: scope },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>选择分发范围与目标对象。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            分发范围
            <select
              aria-label="分发范围"
              className="rounded-md border bg-background p-2"
              value={scope}
              onChange={(e) => setScope(e.target.value as DistributeScope)}
            >
              <option value="ORGANIZATION">整个组织</option>
              {props.teams.length > 0 && <option value="TEAM">团队</option>}
              {props.members.length > 0 && <option value="MEMBER">单个成员</option>}
            </select>
          </label>
          {scope === "TEAM" && (
            <label className="flex flex-col gap-1 text-sm">
              目标团队
              <select
                aria-label="目标团队"
                className="rounded-md border bg-background p-2"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">请选择团队</option>
                {props.teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
          {scope === "MEMBER" && (
            <label className="flex flex-col gap-1 text-sm">
              目标成员
              <select
                aria-label="目标成员"
                className="rounded-md border bg-background p-2"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">请选择成员</option>
                {props.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>分发</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

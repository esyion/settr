"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";
import { policiesApi } from "@/features/policies/api";
import type {
  EffectivePolicies,
  PolicyDistribution,
  PolicyReviewRequest,
  PolicyVersion,
} from "@/lib/contracts";
import type { PoliciesDataApi } from "@/features/policies/types";

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * policies feature 数据中枢。
 */
export function usePoliciesData(): PoliciesDataApi {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  // 直接在 selector 内从 myPermissions 计算(org 级或任一 team 级命中即可见),
  // 保证权限落地/切换组织时触发重渲染;目标级权限仍由后端逐请求裁决。
  // 注:store.hasPermission 引用恒稳,订阅它不会触发重渲染,不可用在此处。
  const canDistributePolicy = useWorkspaceStore((s) => {
    const my = s.myPermissions;
    if (!my) return false;
    return (
      my.orgLevel.includes("policy:distribute") ||
      my.teamLevel.some((t) => t.permissions.includes("policy:distribute"))
    );
  });
  const [pendingPolicies, setPendingPolicies] = useState<PolicyReviewRequest[]>(
    [],
  );
  const [agentVersions, setAgentVersions] = useState<PolicyVersion[]>([]);
  const [claudeVersions, setClaudeVersions] = useState<PolicyVersion[]>([]);
  const [distributions, setDistributions] = useState<PolicyDistribution[]>([]);
  const [effectivePolicies, setEffectivePolicies] =
    useState<EffectivePolicies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 竞态守卫:响应落地时组织已切换则丢弃,防止旧组织数据串台
  const organizationIdRef = useRef(organizationId);
  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  /** 首屏/刷新共用的加载函数;无组织时清空本地状态。 */
  const reload = useCallback(async () => {
    if (!organizationId) {
      setPendingPolicies([]);
      setAgentVersions([]);
      setClaudeVersions([]);
      setDistributions([]);
      setEffectivePolicies(null);
      return;
    }
    const requestOrgId = organizationId;
    setError(null);
    try {
      const [pending, agent, claude, dists, effective] = await Promise.all([
        policiesApi.listPolicyReviewRequests(requestOrgId),
        policiesApi.listPolicyHistory(requestOrgId, "AGENT"),
        policiesApi.listPolicyHistory(requestOrgId, "CLAUDE"),
        policiesApi.listPolicyDistributions(requestOrgId),
        policiesApi.getEffectivePolicies(requestOrgId),
      ]);
      if (organizationIdRef.current !== requestOrgId) return;
      setPendingPolicies(pending);
      setAgentVersions(agent);
      setClaudeVersions(claude);
      setDistributions(dists);
      setEffectivePolicies(effective);
    } catch (caught) {
      if (organizationIdRef.current !== requestOrgId) return;
      setError(readableError(caught, "加载政策失败"));
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitPolicyChange = useCallback(
    async (input: {
      policyType: "AGENT" | "CLAUDE";
      content: string;
      message: string;
    }) => {
      /** 返回是否提交成功,供表单决定是否清空输入。 */
      if (!organizationId) return false;
      setBusy("提交政策");
      try {
        await policiesApi.submitPolicyDraft(organizationId, input);
        toast.success("政策草稿已提交");
        return true;
      } catch (caught) {
        toast.error(readableError(caught, "提交政策失败"));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const reviewPolicyChange = useCallback(
    async (requestId: string, decision: "APPROVED" | "REJECTED") => {
      if (!organizationId) return;
      setBusy("审批政策");
      try {
        await policiesApi.reviewPolicyRequest(
          organizationId,
          requestId,
          decision,
        );
        setPendingPolicies((cur) => cur.filter((p) => p.id !== requestId));
        toast.success(`已${decision === "APPROVED" ? "批准" : "拒绝"}`);
      } catch (caught) {
        toast.error(readableError(caught, "审批失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const withdrawDistribution = useCallback(
    async (distributionId: string) => {
      if (!organizationId) return;
      setBusy("撤回分发");
      try {
        await policiesApi.withdrawPolicyDistribution(
          organizationId,
          distributionId,
        );
        setDistributions((cur) =>
          cur.map((d) =>
            d.id === distributionId ? { ...d, withdrawn: true } : d,
          ),
        );
        toast.success("已撤回分发");
      } catch (caught) {
        toast.error(readableError(caught, "撤回失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  /**
   * 分发 APPROVED 版本;成功后刷新列表,失败 toast 后 rethrow
   * (对话框保持打开供重试)。
   */
  const distributePolicyVersion = useCallback(
    async (input: {
      versionId: string;
      scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
      teamId?: string;
      memberId?: string;
    }) => {
      if (!organizationId) return;
      setBusy("分发政策");
      try {
        await policiesApi.distributePolicyVersion(organizationId, input);
        toast.success("已分发");
        await reload();
      } catch (caught) {
        toast.error(readableError(caught, "分发失败"));
        throw caught;
      } finally {
        setBusy(null);
      }
    },
    [organizationId, reload],
  );

  return {
    pendingPolicies,
    agentVersions,
    claudeVersions,
    distributions,
    effectivePolicies,
    organizationId: organizationId ?? "",
    error,
    busy,
    canDistributePolicy,
    submitPolicyChange,
    reviewPolicyChange,
    withdrawDistribution,
    distributePolicyVersion,
  };
}

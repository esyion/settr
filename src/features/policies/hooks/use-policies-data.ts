"use client";

import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    if (!organizationId) {
      void Promise.resolve().then(() => {
        setPendingPolicies([]);
        setAgentVersions([]);
        setClaudeVersions([]);
        setDistributions([]);
        setEffectivePolicies(null);
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [pending, agent, claude, dists] = await Promise.all([
          policiesApi.listPolicyReviewRequests(organizationId),
          policiesApi.listPolicyHistory(organizationId, "AGENT"),
          policiesApi.listPolicyHistory(organizationId, "CLAUDE"),
          policiesApi.listPolicyDistributions(organizationId),
        ]);
        if (cancelled) return;
        setPendingPolicies(pending);
        setAgentVersions(agent);
        setClaudeVersions(claude);
        setDistributions(dists);
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载政策失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const submitPolicyChange = useCallback(
    async (input: {
      policyType: "AGENT" | "CLAUDE";
      content: string;
      message: string;
    }) => {
      if (!organizationId) return;
      setBusy("提交政策");
      try {
        await policiesApi.submitPolicyDraft(organizationId, input);
        toast.success("政策草稿已提交");
      } catch (caught) {
        toast.error(readableError(caught, "提交政策失败"));
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

  return {
    pendingPolicies,
    agentVersions,
    claudeVersions,
    distributions,
    effectivePolicies,
    organizationId: organizationId ?? "",
    teamId: "",
    projectId: "",
    error,
    busy,
    submitPolicyChange,
    reviewPolicyChange,
    withdrawDistribution,
  };
}
"use client";

import { PageHeader } from "@/components/page-header";
import { SubmitPolicyCard } from "@/features/policies/components/submit-policy";
import { PendingPoliciesCard } from "@/features/policies/components/pending-policies";
import { EffectivePolicyCard } from "@/features/policies/components/effective-policy";
import { HistoryCard } from "@/features/policies/components/history-panel";
import { DistributePanel } from "@/features/policies/components/distribute-panel";
import { usePoliciesData } from "@/features/policies";

/**
 * 政策管理页。
 */
export default function PoliciesPage() {
  const data = usePoliciesData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="规范"
        description="提交、审批、查看与分发规则版本。"
      />
      <SubmitPolicyCard data={data} />
      <PendingPoliciesCard data={data} />
      <EffectivePolicyCard data={data} />
      <HistoryCard data={data} />
      <DistributePanel data={data} />
    </div>
  );
}
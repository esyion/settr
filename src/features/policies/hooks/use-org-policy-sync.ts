"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/features/context/store";
import { applyOrgPolicyToNative, policiesApi } from "@/features/policies/api";
import { isTauriRuntime } from "@/lib/tauri";

/** 组织策略自动落地间隔(毫秒)。 */
const ORG_POLICY_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * effective 接口对 team/project 的默认值:客户端当前没有团队/项目上下文,
 * 传 0 让服务端只按组织与成员两个维度解析。
 */
const NO_SCOPE_ID = "0";

/**
 * 组织策略自动落地:激活组织期间,周期性拉取生效的 AGENT/CLAUDE 策略
 * 并写入本地规则文档的托管区块;切回个人空间时清除托管区块。
 *
 * 失败(离线、权限变化)静默降级,下一轮重试;首次挂载且从未进入过组织时
 * 不做清除,避免登录引导阶段误删。
 */
export function useOrgPolicySync() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const enteredOrgRef = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!organizationId) {
      if (!enteredOrgRef.current) return;
      enteredOrgRef.current = false;
      applyOrgPolicyToNative({ agent: null, claude: null }).catch((error) => {
        console.warn("清除组织策略托管区块失败:", error);
      });
      return;
    }
    enteredOrgRef.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        const effective = await policiesApi.getEffectivePolicies(
          organizationId,
          NO_SCOPE_ID,
          NO_SCOPE_ID,
        );
        if (cancelled) return;
        await applyOrgPolicyToNative({
          agent: effective.agent?.content ?? null,
          claude: effective.claude?.content ?? null,
        });
      } catch (error) {
        console.warn("组织策略落地失败:", error);
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), ORG_POLICY_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId]);
}

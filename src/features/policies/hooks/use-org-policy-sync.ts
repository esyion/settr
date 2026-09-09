"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/features/context/store";
import { applyOrgPolicyToNative, policiesApi } from "@/features/policies/api";
import { subscribeOrgContentChange } from "@/lib/push-bus";
import { isTauriRuntime } from "@/lib/tauri";

/** 组织策略兜底轮询间隔(毫秒)。推送为主,本轮询只作断线/丢信号兜底。 */
const ORG_POLICY_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * 组织策略自动落地:激活组织期间拉取生效的 AGENT/CLAUDE 策略并写入本地
 * 规则文档的托管区块;切回个人空间时清除托管区块。
 *
 * 时效性由组织推送(SSE)驱动:服务端分发/撤回/成员关系变化 → usePushEvents
 * 收到信号 → push-bus 合并 → 本 hook 立即重拉;轮询(15 分钟)仅兜底
 * 推送断线或丢信号的场景。
 *
 * 生效内容由服务端按 MEMBER > TEAM > ORGANIZATION 聚合解析,客户端不传团队参数。
 * 失败(离线、权限变化)静默降级,下一轮重试;首次挂载且从未进入过组织时
 * 不做清除,避免登录引导阶段误删。
 */
export function useOrgPolicySync() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const enteredOrgRef = useRef(false);
  // 指向最新一轮拉取动作,供推送信号订阅方触发(避免为订阅重建连接 effect)。
  const runRef = useRef<() => void>(() => undefined);

  // 推送信号 → 立即重拉(总线已做 1 秒合并);非当前组织的信号忽略。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    return subscribeOrgContentChange((changedOrgId) => {
      if (changedOrgId && changedOrgId !== organizationId) return;
      runRef.current();
    });
  }, [organizationId]);

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
        const effective = await policiesApi.getEffectivePolicies(organizationId);
        if (cancelled) return;
        await applyOrgPolicyToNative({
          agent: effective.agent?.content ?? null,
          claude: effective.claude?.content ?? null,
        });
      } catch (error) {
        console.warn("组织策略落地失败:", error);
      }
    };
    runRef.current = () => void run();
    void run();
    const timer = window.setInterval(() => void run(), ORG_POLICY_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId]);
}

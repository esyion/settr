"use client";

import { Cloud, ShieldCheck } from "lucide-react";

/**
 * 鉴权界面左侧品牌介绍区。
 * <p>
 * 仅承担展示职责，不持有任何状态，方便父组件按模式复用同一外壳。
 */
export function AuthHero() {
  return (
    <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
      <div>
        <div className="mb-10 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/10">
            <Cloud className="size-5" />
          </div>
          <div>
            <p className="font-mono text-xs text-primary-foreground/60">
              ~/AGENTS.md
            </p>
            <h1 className="text-xl font-semibold">Agents Plus</h1>
          </div>
        </div>
        <h2 className="max-w-sm text-3xl font-semibold leading-tight">
          在每台电脑上，保持同一套 Agent 规则。
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-primary-foreground/70">
          通过真实云端版本链同步本地
          AGENTS.md。每次覆盖都有备份，发生冲突时不会静默丢失内容。
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-primary-foreground/60">
        <ShieldCheck className="size-4" />
        会话凭据保存在系统安全存储中
      </div>
    </section>
  );
}

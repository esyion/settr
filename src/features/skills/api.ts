import { invoke } from "@tauri-apps/api/core";
import type { HarnessKey } from "@/features/skills/skill-harness";

/**
 * Skills feature 的 IPC gateway。
 *
 * AGENTS.md §4.1:前端调用 Rust 时,统一经过 feature 的 api.ts 或 services/ipc gateway;
 * 组件内禁止散落 invoke 调用。本文件是 skills feature 的唯一 IPC 入口。
 *
 * 命名约定:
 *   - 后端 command 名原样映射为同名函数;
 *   - 所有函数返回 Promise,失败抛出 Error(Rust 端 String 错误透传)。
 */

export interface LocalSkillStateSnapshot {
  skills?: Record<
    string,
    {
      enabledHarnesses?: string[];
    }
  >;
}

/**
 * 异步把 File 转为 number[](走原生 arrayBuffer,避免大文件爆栈)。
 */
export async function fileToBytesAsync(file: File): Promise<number[]> {
  const buf = file.arrayBuffer ? await file.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsArrayBuffer(file);
  });
  return Array.from(new Uint8Array(buf));
}

/**
 * 调用 Tauri command,统一错误处理(Rust String 透传为 Error)。
 */
async function callCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === "string" ? error : String(error));
  }
}

/** 把 SSOT 拉一次(返回结构与 read_local_skill_state 保持一致)。 */
export function readLocalSkillState(): Promise<LocalSkillStateSnapshot> {
  return callCommand<LocalSkillStateSnapshot>("read_local_skill_state");
}

/** 启用 harness(自动 install + dispatch)。 */
export function enableSkillHarness(
  skillId: string,
  harness: HarnessKey,
): Promise<unknown> {
  return callCommand("enable_skill_harness", { skillId, harness });
}

/** 禁用 harness(从 state 移除 + 删除 harness 目录下的副本)。 */
export function disableSkillHarness(
  skillId: string,
  skillName: string,
  harness: HarnessKey,
): Promise<void> {
  return callCommand<void>("disable_skill_harness", { skillId, skillName, harness });
}

/** 重新同步单个 harness。 */
export function resyncSkillHarness(
  skillId: string,
  skillName: string,
  harness: HarnessKey,
): Promise<void> {
  return callCommand<void>("resync_skill_harness", { skillId, skillName, harness });
}

/** 扫描本机已安装的 harness 列表。 */
export function scanLocalHarnesses(): Promise<string[]> {
  return callCommand<string[]>("scan_local_harnesses");
}

/** 列出服务端 skill(MVP: personal 范围)。 */
export function listSkills(): Promise<unknown[]> {
  return callCommand<unknown[]>("list_skills");
}


/**
 * 把 ZIP 与元数据通过 Rust api_upload 命令上传。
 *
 * AGENTS.md §4.1 + §7:前端不能直接 fetch 后端,所有上传统一经 IPC gateway;
 * 这样 Rust 端可统一控制 HTTPS 校验、路径白名单和 User-Agent。
 */
export interface PublishSkillVersionInput {
  skillId: string;
  version: string;
  changelog?: string;
  zipBytes: number[];
}

export function publishSkillVersion(
  input: PublishSkillVersionInput,
): Promise<{ status: number; body: string; requestId: string | null }> {
  return callCommand("publish_skill_version", { ...input });
}

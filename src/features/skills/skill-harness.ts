import type { ComponentType } from "react";
import {
  Claude,
  Codex,
  Gemini,
  Grok,
  OpenCode,
  HermesAgent,
  Pi,
} from "@lobehub/icons";

/** harness 标识(对齐后端 HarnessId 枚举)。 */
export type HarnessKey =
  | "claude"
  | "codex"
  | "gemini"
  | "grokbuild"
  | "opencode"
  | "hermes"
  | "pi";

export type HarnessIcon = ComponentType<{ size?: number; className?: string }>;

export const HARNESS_LIST: HarnessKey[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "hermes",
  "pi",
];

export const HARNESS_META: Record<
  HarnessKey,
  { label: string; tone: string; Icon: HarnessIcon; enabledClass: string }
> = {
  claude: {
    label: "Claude",
    Icon: Claude.Color,
    tone: "border-orange-300",
    enabledClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  codex: {
    label: "Codex",
    Icon: Codex.Color,
    tone: "border-emerald-300",
    enabledClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  gemini: {
    label: "Gemini",
    Icon: Gemini.Color,
    tone: "border-sky-300",
    enabledClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  grokbuild: {
    label: "Grok Build",
    Icon: Grok,
    tone: "border-purple-300",
    enabledClass:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  },
  opencode: {
    label: "OpenCode",
    Icon: OpenCode,
    tone: "border-indigo-300",
    enabledClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  hermes: {
    label: "Hermes",
    Icon: HermesAgent,
    tone: "border-rose-300",
    enabledClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  pi: {
    label: "Pi",
    Icon: Pi,
    tone: "border-amber-300",
    enabledClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

export type LocalSkillEntry = { enabledHarnesses: string[] };
export type LocalState = Record<string, LocalSkillEntry>;
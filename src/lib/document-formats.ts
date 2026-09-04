import type { DocumentFormat } from "@/lib/contracts";

export type DocumentFormatConfig = {
  label: string;
  displayPath: string;
  apiSlug: "agents-md" | "claude-md";
  documentType: "agents_md" | "claude_md";
};

/** Maps each IPC format to its user-facing and backend contract values. */
export const DOCUMENT_FORMAT_CONFIGS: Record<DocumentFormat, DocumentFormatConfig> = {
  agentsMd: {
    label: "AGENTS.md",
    displayPath: "~/AGENTS.md",
    apiSlug: "agents-md",
    documentType: "agents_md",
  },
  claudeMd: {
    label: "CLAUDE.md",
    displayPath: "~/.claude/CLAUDE.md",
    apiSlug: "claude-md",
    documentType: "claude_md",
  },
};

export const DOCUMENT_FORMAT_OPTIONS = Object.entries(DOCUMENT_FORMAT_CONFIGS).map(
  ([value, config]) => ({ value: value as DocumentFormat, ...config }),
);

/** Returns the stable contract configuration for a document format. */
export function getDocumentFormatConfig(format: DocumentFormat): DocumentFormatConfig {
  return DOCUMENT_FORMAT_CONFIGS[format];
}

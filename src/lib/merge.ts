import { merge } from "node-diff3";

export interface MergeResult { conflict: boolean; content: string; }

export function mergeDocuments(local: string, base: string, remote: string): MergeResult {
  const localLines = local.split(/\\r?\\n/);
  const baseLines = base.split(/\\r?\\n/);
  const remoteLines = remote.split(/\\r?\\n/);
  const result = merge(localLines, baseLines, remoteLines, { label: { a: "LOCAL", o: "BASE", b: "REMOTE" }, excludeFalseConflicts: true });
  return { conflict: result.conflict, content: result.result.join("\\n") };
}

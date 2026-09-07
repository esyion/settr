import type { LocalManifest } from "@/lib/contracts";
import { ApiClientError } from "@/lib/api-client";

/** Converts an unknown failure into a user-facing message with request context. */
export function readableError(error: unknown): string {
  if (error instanceof ApiClientError)
    return (
      error.message +
      (error.requestId ? "（请求 ID: " + error.requestId + "）" : "")
    );
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

/** Returns whether an error indicates that the desktop cannot reach its backend. */
export function isOfflineError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NETWORK_") ||
      error.message.startsWith("DESKTOP_RUNTIME_REQUIRED"))
  );
}

/** Builds the sync manifest for a newly applied remote revision. */
export function buildSyncManifest(
  previous: LocalManifest | undefined,
  context: { documentId: string | null; deviceId: string | null },
  revision: { id: string; contentHash: string },
): LocalManifest {
  return {
    ...(previous || {
      schemaVersion: 1,
      documentId: null,
      deviceId: null,
      baseRevisionId: null,
      baseContentHash: null,
      lastAppliedRevisionId: null,
      lastSyncedAt: null,
      localContentHash: null,
    }),
    schemaVersion: 1,
    documentId: context.documentId,
    deviceId: context.deviceId,
    baseRevisionId: revision.id,
    baseContentHash: revision.contentHash,
    lastAppliedRevisionId: revision.id,
    lastSyncedAt: new Date().toISOString(),
    localContentHash: revision.contentHash,
  };
}
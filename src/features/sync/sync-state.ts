import { api, ApiClientError, loadRuntimeSnapshot } from "@/lib/api-client";
import type { Revision, SyncState, SyncStatus } from "@/lib/contracts";
import { clearSession, loadSession } from "@/lib/session-store";
import { normalizeContentHash } from "@/features/sync/hash";

export const APP_VERSION = "0.1.0";
export const EMPTY_STATE: SyncState = {
  status: "loading",
  local: null,
  identity: null,
  user: null,
  document: null,
  head: null,
  base: null,
  devices: [],
  revisions: null,
  message: null,
  requestId: null,
  refreshedAt: null,
};

export function deriveStatus(
  state: Pick<SyncState, "local" | "document" | "head">,
): SyncStatus {
  const local = state.local;
  const head = state.head;
  const document = state.document;
  if (!local || !document) return "loading";
  if (!head && local.exists) return "localOnly";
  if (!head && !local.exists) return "initialChoice";
  if (!local.exists) return "remoteModified";
  if (
    head &&
    local.contentHash &&
    normalizeContentHash(local.contentHash) ===
      normalizeContentHash(head.contentHash)
  )
    return "synced";
  if (!local.manifest.baseRevisionId || !local.manifest.baseContentHash)
    return "initialChoice";
  const localChanged =
    normalizeContentHash(local.contentHash || "") !==
    normalizeContentHash(local.manifest.baseContentHash);
  const remoteChanged =
    document.headRevisionId !== local.manifest.baseRevisionId;
  if (localChanged && remoteChanged) return "conflict";
  return localChanged ? "localModified" : "remoteModified";
}

function isAuthenticationError(error: unknown) {
  return error instanceof ApiClientError && [40100, 40101, 40102, 40103].includes(error.code);
}

export async function loadWorkspace(): Promise<SyncState> {
  const runtime = await loadRuntimeSnapshot(APP_VERSION);
  const session = await loadSession();
  if (!session)
    return {
      ...EMPTY_STATE,
      status: "signedOut",
      local: runtime.local,
      identity: runtime.identity,
      message: "请登录后连接云端",
    };
  let user;
  try {
    user = await api.me();
  } catch (error) {
    if (!isAuthenticationError(error)) throw error;
    await clearSession();
    return {
      ...EMPTY_STATE,
      status: "signedOut",
      local: runtime.local,
      identity: runtime.identity,
      message: "登录会话已过期，请重新登录",
    };
  }
  const document = await api.document();
  const [devices, revisions] = await Promise.all([
    api.devices(),
    api.revisions(document.id, 1, 20),
  ]);
  let head: Revision | null = null;
  let base: Revision | null = null;
  if (document.headRevisionId)
    head = await api.revision(document.id, document.headRevisionId);
  if (
    runtime.local.manifest.baseRevisionId &&
    runtime.local.manifest.baseRevisionId !== document.headRevisionId
  )
    base = await api.revision(
      document.id,
      runtime.local.manifest.baseRevisionId,
    );
  const status = deriveStatus({ local: runtime.local, document, head });
  return {
    status,
    local: runtime.local,
    identity: runtime.identity,
    user,
    document,
    head,
    base,
    devices,
    revisions,
    message: null,
    requestId: null,
    refreshedAt: new Date().toISOString(),
  };
}

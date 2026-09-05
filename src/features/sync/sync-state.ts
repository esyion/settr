import {
  api,
  ApiClientError,
  loadRuntimeSnapshot,
  saveLocalManifest,
} from "@/lib/api-client";
import type {
  DocumentFormat,
  Revision,
  SyncState,
  LocalSnapshot,
  SyncStatus,
} from "@/lib/contracts";
import { clearSession, loadSession } from "@/lib/session-store";
import { normalizeContentHash } from "@/features/sync/hash";

export const APP_VERSION = "0.1.0";
export const EMPTY_STATE: SyncState = {
  status: "loading",
  format: "agentsMd",
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

/** Derives the user-visible synchronization state from local and remote snapshots. */
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

/** Returns whether an API failure means the saved authentication session is unusable. */
function isAuthenticationError(error: unknown) {
  return error instanceof ApiClientError && [40100, 40101, 40102, 40103, 40302].includes(error.code);
}

/** Returns whether a locally saved revision no longer exists on the server. */
function isRevisionNotFound(error: unknown) {
  return error instanceof ApiClientError && error.code === 40402;
}

/** Removes sync pointers that refer to a revision missing from the current account. */
async function clearStaleBaseManifest(
  format: DocumentFormat,
  local: LocalSnapshot,
): Promise<LocalSnapshot> {
  if (!local) return local;
  const manifest = await saveLocalManifest(format, {
    ...local.manifest,
    schemaVersion: 1,
    baseRevisionId: null,
    baseContentHash: null,
    lastAppliedRevisionId: null,
    lastSyncedAt: null,
  });
  return { ...local, manifest };
}

/** Loads the local snapshot and all authenticated remote synchronization state. */
export async function loadWorkspace(format: DocumentFormat): Promise<SyncState> {
  const runtime = await loadRuntimeSnapshot(APP_VERSION, format);
  const session = await loadSession();
  if (!session)
    return {
      ...EMPTY_STATE,
      status: "signedOut",
      format,
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
      format,
      local: runtime.local,
      identity: runtime.identity,
      message: "登录会话已过期，请重新登录",
    };
  }
  const document = await api.document(format);
  const [devices, revisions] = await Promise.all([
    api.devices(),
    api.revisions(document.id, 1, 20),
  ]);
  let head: Revision | null = null;
  let base: Revision | null = null;
  if (document.headRevisionId)
    head = await api.revision(document.id, document.headRevisionId);
  let local = runtime.local;
  if (
    local.manifest.baseRevisionId &&
    local.manifest.baseRevisionId !== document.headRevisionId
  ) {
    try {
      base = await api.revision(document.id, local.manifest.baseRevisionId);
    } catch (error) {
      if (!isRevisionNotFound(error)) throw error;
      local = await clearStaleBaseManifest(format, local);
    }
  }
  const status = deriveStatus({ local, document, head });
  return {
    status,
    format,
    local,
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

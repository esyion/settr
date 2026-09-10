import { APP_VERSION } from "@/lib/app-version";
import {
  api,
  ApiClientError,
  loadRuntimeSnapshot,
  saveLocalManifest,
} from "@/lib/api-client";
import type {
  DeviceIdentity,
  DocumentFormat,
  Revision,
  SyncState,
  LocalSnapshot,
  SyncStatus,
} from "@/lib/contracts";
import { clearSession, loadSession } from "@/lib/session-store";
import { normalizeContentHash } from "@/features/sync/hash";

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
function readableFailure(error: unknown) {
  if (error instanceof ApiClientError) {
    return (error.message || "请求失败") + (error.requestId ? "（请求 ID: " + error.requestId + "）" : "");
  }
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}

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
/**
 * 加载工作区(本地 + 后端)。
 *
 * 安全契约：任何后端调用若返回 401/403(已认证失败),立即清空 session 并返回 signedOut,
 * 而不是把错误冒泡成「error」让 layout 把整壳替换为登录页。
 * 其他错误(5xx/网络)继续向上抛,由 controller 决定降级策略。
 */
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
  let document;
  try {
    document = await api.document(format);
  } catch (error) {
    if (isAuthenticationError(error)) {
      await clearSession();
      return signedOutState(runtime, "登录会话已过期，请重新登录");
    }
    throw error;
  }
  const failures: string[] = [];
  let devices: Awaited<ReturnType<typeof api.devices>> | null = null;
  let revisions: Awaited<ReturnType<typeof api.revisions>> | null = null;
  let head: Revision | null = null;
  try {
    head = await api.revision(document.id, document.headRevisionId);
  } catch (error) {
    if (isAuthenticationError(error)) {
      await clearSession();
      return signedOutState(runtime, "登录会话已过期，请重新登录");
    }
    throw error;
  }
  let base: Revision | null = null;
  let local = runtime.local;
  const baseRevisionId = local.manifest.baseRevisionId;
  try {
    const [deviceList, revisionList] = await Promise.all([
      api.devices(),
      api.revisions(document.id, 1, 20),
    ]);
    devices = deviceList;
    revisions = revisionList;
  } catch (error) {
    if (isAuthenticationError(error)) {
      await clearSession();
      return signedOutState(runtime, "登录会话已过期，请重新登录");
    }
    failures.push(readableFailure(error));
  }
  if (baseRevisionId && baseRevisionId !== document.headRevisionId) {
    try {
      base = await api.revision(document.id, baseRevisionId);
    } catch (error) {
      if (isAuthenticationError(error)) {
        await clearSession();
        return signedOutState(runtime, "登录会话已过期，请重新登录");
      }
      if (!isRevisionNotFound(error)) {
        failures.push(readableFailure(error));
      } else {
        local = await clearStaleBaseManifest(format, local);
      }
    }
  }
  const status = deriveStatus({ local, document, head });
  const baseResponse: SyncState = {
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
    message: failures.length > 0 ? failures.join("；") : null,
    requestId: null,
    refreshedAt: new Date().toISOString(),
  };
  if (failures.length > 0 && devices === null && revisions === null) {
    return { ...baseResponse, status: "error" };
  }
  return baseResponse;
}

/**
 * 构造已退出登录态：会话失效时复用,避免多处重复字面量。
 */
async function signedOutState(
  runtime: { local: LocalSnapshot; identity: DeviceIdentity | null },
  message: string,
): Promise<SyncState> {
  return {
    ...EMPTY_STATE,
    status: "signedOut",
    format: "agentsMd",
    local: runtime.local,
    identity: runtime.identity,
    message,
  };
}


"use client";
import { useCallback, useEffect } from "react";
import {
  api,
  ApiClientError,
  applyRemoteDocument,
  getApiBaseUrl,
  saveLocalManifest,
  setApiBaseUrl,
} from "@/lib/api-client";
import type {
  LocalManifest,
  Revision,
  SyncState,
} from "@/lib/contracts";
import { clearSession } from "@/lib/session-store";
import { toast } from "sonner";
import { isTauriRuntime } from "@/lib/tauri";
import { useDeviceMaintenance } from "@/features/sync/use-device-maintenance";
import { useSyncStore } from "@/features/sync/store/sync-store";
import { mergeDocuments } from "@/lib/merge";
import { normalizeContentHash, sha256 } from "@/features/sync/hash";
import {
  APP_VERSION,
  EMPTY_STATE,
  loadWorkspace,
} from "@/features/sync/sync-state";
function readableError(error: unknown) {
  if (error instanceof ApiClientError)
    return (
      error.message +
      (error.requestId ? "（请求 ID: " + error.requestId + "）" : "")
    );
  if (error instanceof Error) return error.message;
  return "发生未知错误";
}
function isOfflineError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.startsWith("NETWORK_") ||
      error.message.startsWith("DESKTOP_RUNTIME_REQUIRED"))
  );
}
export function useSyncController() {
  const { state, busy, notice, mergeDraft, setState, setBusy, setNotice, setMergeDraft } = useSyncStore();
  const refresh = useCallback(async () => {
    setBusy("refresh");
    setState((previous) => ({ ...previous, status: "loading", message: null }));
    try {
      const next = await loadWorkspace();
      setState(next);
      setNotice(null);
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: isOfflineError(error) ? "offline" : "error",
        message: readableError(error),
      }));
    } finally {
      setBusy(null);
    }
  }, [setBusy, setNotice, setState]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const onLocalSnapshot = useCallback((local: SyncState["local"]) => {
    if (!local) return;
    setState((previous) => ({
      ...previous,
      local,
      status:
        previous.document &&
        previous.head &&
        local.contentHash &&
        normalizeContentHash(local.contentHash) ===
          normalizeContentHash(previous.head.contentHash)
          ? "synced"
          : previous.status,
    }));
  }, [setState]);
  const onMaintenanceError = useCallback((error: unknown) => setNotice(readableError(error)), [setNotice]);
  useDeviceMaintenance({ identity: state.identity, active: Boolean(state.user), document: state.document, head: state.head, onLocalSnapshot, onError: onMaintenanceError });
  async function action(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setNotice(null);
    try {
      await fn();
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setBusy(null);
    }
  }
  async function loginCompleted() {
    await refresh();
  }
  async function upload(message: string) {
    await action("upload", async () => {
      if (!state.document || !state.local?.content || !state.local.contentHash)
        throw new Error("本地 AGENTS.md 不存在或为空");
      const revision = await api.submitRevision(state.document.id, {
        parentRevisionId: state.head?.id || null,
        content: state.local.content,
        contentHash: state.local.contentHash,
        message: message.trim() || "从当前设备上传 AGENTS.md",
        clientMutationId: crypto.randomUUID(),
        metadata: {
          source: "desktop",
          platform: state.identity?.platform || "unknown",
          appVersion: APP_VERSION,
        },
      });
      await saveLocalManifest({
        ...state.local.manifest,
        schemaVersion: 1,
        documentId: state.document.id,
        deviceId: state.identity?.deviceId || null,
        baseRevisionId: revision.id,
        baseContentHash: revision.contentHash,
        lastAppliedRevisionId: revision.id,
        lastSyncedAt: new Date().toISOString(),
        localContentHash: revision.contentHash,
      });
      setNotice("已创建云端版本 " + revision.id);
      await refresh();
    });
  }
  async function apply(revision?: Revision | null) {
    await action("apply", async () => {
      const target = revision || state.head;
      if (!target) throw new Error("云端还没有可应用的版本");
      const manifest: LocalManifest = {
        ...(state.local?.manifest || { schemaVersion: 1, documentId: null, deviceId: null, baseRevisionId: null, baseContentHash: null, lastAppliedRevisionId: null, lastSyncedAt: null, localContentHash: null }),
        schemaVersion: 1,
        documentId: state.document?.id || null,
        deviceId: state.identity?.deviceId || null,
        baseRevisionId: target.id,
        baseContentHash: target.contentHash,
        lastAppliedRevisionId: target.id,
        lastSyncedAt: new Date().toISOString(),
        localContentHash: target.contentHash,
      };
      await applyRemoteDocument(
        target.content,
        state.local?.contentHash || null,
        manifest,
      );
      setNotice("已安全应用云端版本 " + target.id);
      await refresh();
    });
  }
  function startMerge() {
    if (!state.local?.content || !state.base?.content || !state.head?.content) {
      setNotice("缺少三方合并所需的 base、local 或 remote 内容，请先刷新");
      return;
    }
    const merged = mergeDocuments(
      state.local.content,
      state.base.content,
      state.head.content,
    );
    setMergeDraft(merged.content);
    setNotice(
      merged.conflict
        ? "检测到重叠修改，请检查并手工处理冲突标记"
        : "三方合并成功，请确认后提交新版本",
    );
  }
  async function resolveMerge() {
    await action("merge", async () => {
      if (
        !mergeDraft ||
        !state.document ||
        !state.local?.contentHash ||
        !state.head
      )
        throw new Error("合并上下文已失效，请刷新后重试");
      const revision = await api.submitRevision(state.document.id, {
        parentRevisionId: state.head.id,
        content: mergeDraft,
        contentHash: await sha256(mergeDraft),
        message: "提交三方合并结果",
        clientMutationId: crypto.randomUUID(),
        metadata: { source: "merge", baseRevisionId: state.base?.id || null },
      });
      const manifest: LocalManifest = {
        ...state.local.manifest,
        schemaVersion: 1,
        documentId: state.document.id,
        deviceId: state.identity?.deviceId || null,
        baseRevisionId: revision.id,
        baseContentHash: revision.contentHash,
        lastAppliedRevisionId: revision.id,
        lastSyncedAt: new Date().toISOString(),
        localContentHash: revision.contentHash,
      };
      await applyRemoteDocument(mergeDraft, state.local.contentHash, manifest);
      setMergeDraft(null);
      setNotice("已提交并应用合并版本 " + revision.id);
      await refresh();
    });
  }
  async function logout() {
    await action("logout", async () => {
      await api.logout();
      await clearSession();
      setMergeDraft(null);
      setState((previous) => ({
        ...EMPTY_STATE,
        status: "signedOut",
        local: previous.local,
        identity: previous.identity,
        message: "已退出登录",
      }));
    });
  }
  async function restore(revisionId: string) {
    if (!state.document) return;
    await action("restore", async () => {
      const revision = await api.restoreRevision(
        state.document!.id,
        revisionId,
        "从历史版本恢复",
      );
      const manifest: LocalManifest = {
        ...(state.local?.manifest || { schemaVersion: 1, documentId: null, deviceId: null, baseRevisionId: null, baseContentHash: null, lastAppliedRevisionId: null, lastSyncedAt: null, localContentHash: null }),
        schemaVersion: 1,
        documentId: state.document!.id,
        deviceId: state.identity?.deviceId || null,
        baseRevisionId: revision.id,
        baseContentHash: revision.contentHash,
        lastAppliedRevisionId: revision.id,
        lastSyncedAt: new Date().toISOString(),
        localContentHash: revision.contentHash,
      };
      await applyRemoteDocument(
        revision.content,
        state.local?.contentHash || null,
        manifest,
      );
      toast.success("已恢复为新版本", { description: revision.id });
      setNotice("已恢复为新版本 " + revision.id);
      await refresh();
    });
  }
  async function rename(deviceId: string, name: string) {
    await action("rename:" + deviceId, async () => {
      if (!name.trim()) throw new Error("设备名不能为空");
      await api.renameDevice(deviceId, name.trim());
      await refresh();
    });
  }
  async function revoke(deviceId: string) {
    await action("revoke:" + deviceId, async () => {
      await api.revokeDevice(deviceId);
      await refresh();
    });
  }
  function saveUrl(value: string) {
    try {
      setApiBaseUrl(value);
      setNotice("后端地址已更新：" + getApiBaseUrl());
    } catch (error) {
      setNotice(readableError(error));
    }
  }
  return {
    state,
    busy,
    notice,
    mergeDraft,
    setMergeDraft,
    refresh,
    loginCompleted,
    upload,
    apply,
    startMerge,
    resolveMerge,
    logout,
    restore,
    rename,
    revoke,
    saveUrl,
    desktop: isTauriRuntime(),
  };
}

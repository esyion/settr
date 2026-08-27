"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";
import type { DeviceIdentity, LocalSnapshot, SyncState } from "@/lib/contracts";
import { invokeNative, isTauriRuntime } from "@/lib/tauri";
import { listenLocalFileChanged } from "@/features/sync/api";

/**
 * Maintains the local snapshot from native file-system events and sends device heartbeats.
 */
export function useDeviceMaintenance(input: {
  identity: DeviceIdentity | null;
  active: boolean;
  document: SyncState["document"];
  onLocalSnapshot: (local: LocalSnapshot) => void;
  onError: (error: unknown) => void;
}) {
  const { identity, active, document, onLocalSnapshot, onError } = input;
  /** Subscribes to native local-file events while the authenticated document is active. */
  useEffect(() => {
    if (!active || !document || !isTauriRuntime()) return;
    let cancelled = false;
    let refreshTimer: number | undefined;
    /** Reads the native local snapshot and forwards it to the synchronization store. */
    const checkLocal = async () => {
      try {
        const local = await invokeNative<LocalSnapshot>("get_local_snapshot");
        if (!cancelled) onLocalSnapshot(local);
      } catch (error) {
        if (!cancelled) onError(error);
      }
    };
    /** Debounces bursts of native filesystem events into one snapshot read. */
    const scheduleCheck = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void checkLocal();
      }, 150);
    };
    const unlistenPromise = listenLocalFileChanged(scheduleCheck)
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return undefined;
        }
        void checkLocal();
        return unlisten;
      })
      .catch((error) => {
        if (!cancelled) {
          onError(error);
          void checkLocal();
        }
        return undefined;
      });
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, [active, document, onLocalSnapshot, onError]);
  /** Maintains the server-side last-seen time for the current device. */
  useEffect(() => {
    const deviceId = identity?.deviceId;
    if (!active || !deviceId) return;
    let cancelled = false;
    /** Sends the current device heartbeat while the authenticated workspace is active. */
    const heartbeat = async () => {
      try {
        await api.heartbeat(deviceId);
      } catch (error) {
        if (!cancelled) onError(error);
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, identity?.deviceId, onError]);
}

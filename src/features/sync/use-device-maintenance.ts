"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";
import type { DeviceIdentity, LocalSnapshot, SyncState } from "@/lib/contracts";
import { invokeNative } from "@/lib/tauri";

export function useDeviceMaintenance(input: { identity: DeviceIdentity | null; active: boolean; document: SyncState["document"]; head: SyncState["head"]; onLocalSnapshot: (local: LocalSnapshot) => void; onError: (error: unknown) => void }) {
  const { identity, active, document, head, onLocalSnapshot, onError } = input;
  useEffect(() => {
    if (!active || !document) return;
    let cancelled = false;
    const checkLocal = async () => { try { const local = await invokeNative<LocalSnapshot>("get_local_snapshot"); if (!cancelled) onLocalSnapshot(local); } catch (error) { if (!cancelled) onError(error); } };
    void checkLocal();
    const timer = window.setInterval(() => void checkLocal(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, document, head, onLocalSnapshot, onError]);
  useEffect(() => {
    const deviceId = identity?.deviceId;
    if (!active || !deviceId) return;
    let cancelled = false;
    const heartbeat = async () => { try { await api.heartbeat(deviceId); } catch (error) { if (!cancelled) onError(error); } };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, identity?.deviceId, onError]);
}

"use client";

import { create } from "zustand";
import type { SyncState } from "@/lib/contracts";
import { EMPTY_STATE } from "@/features/sync/sync-state";

type StateUpdater = SyncState | ((previous: SyncState) => SyncState);
interface SyncStore {
  state: SyncState;
  busy: string | null;
  notice: string | null;
  mergeDraft: string | null;
  setState: (next: StateUpdater) => void;
  setBusy: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setMergeDraft: (value: string | null) => void;
  reset: (next?: SyncState) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  state: EMPTY_STATE,
  busy: null,
  notice: null,
  mergeDraft: null,
  setState: (next) => set((current) => ({ state: typeof next === "function" ? next(current.state) : next })),
  setBusy: (busy) => set({ busy }),
  setNotice: (notice) => set({ notice }),
  setMergeDraft: (mergeDraft) => set({ mergeDraft }),
  reset: (state = EMPTY_STATE) => set({ state, busy: null, notice: null, mergeDraft: null }),
}));

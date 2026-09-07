"use client";

import { create } from "zustand";
import type { Skill, SkillVersion } from "@/lib/contracts";

/**
 * Skill 本地状态：
 * <ul>
 *   <li>skillList / listLoading / listError：列表页数据与请求态；</li>
 *   <li>currentSkill / versionList / versionLoading / versionError：详情页数据与请求态；</li>
 *   <li>pendingUpdates / pendingLoading：「有可用更新」角标数据，
 *       列表页与详情页变更后通过 usePendingUpdates().reload() 同步刷新。</li>
 * </ul>
 * 纯 UI 状态，业务数据(api + 服务端)由组件按需拉取后写入。
 */
export interface SkillState {
  skillList: Skill[];
  listLoading: boolean;
  listError: string | null;
  currentSkill: Skill | null;
  versionList: SkillVersion[];
  versionLoading: boolean;
  versionError: string | null;
  pendingUpdates: Skill[];
  pendingLoading: boolean;
}

interface SkillActions {
  setSkillList: (items: Skill[]) => void;
  setListLoading: (loading: boolean) => void;
  setListError: (error: string | null) => void;
  setCurrentSkill: (skill: Skill | null) => void;
  setVersionList: (items: SkillVersion[]) => void;
  setVersionLoading: (loading: boolean) => void;
  setVersionError: (error: string | null) => void;
  setPendingUpdates: (items: Skill[]) => void;
  setPendingLoading: (loading: boolean) => void;
  reset: () => void;
}

/**
 * 默认状态：三个 loading 置 true，使首次挂载立即呈现加载占位，
 * 与迁移前组件内 useState 初始值的行为保持一致。
 */
const initialState: SkillState = {
  skillList: [],
  listLoading: true,
  listError: null,
  currentSkill: null,
  versionList: [],
  versionLoading: true,
  versionError: null,
  pendingUpdates: [],
  pendingLoading: true,
};

export const useSkillStore = create<SkillState & SkillActions>((set) => ({
  ...initialState,
  setSkillList: (items) => set({ skillList: items, listError: null }),
  setListLoading: (loading) => set({ listLoading: loading }),
  setListError: (error) => set({ listError: error }),
  setCurrentSkill: (skill) => set({ currentSkill: skill }),
  setVersionList: (items) => set({ versionList: items, versionError: null }),
  setVersionLoading: (loading) => set({ versionLoading: loading }),
  setVersionError: (error) => set({ versionError: error }),
  setPendingUpdates: (items) => set({ pendingUpdates: items }),
  setPendingLoading: (loading) => set({ pendingLoading: loading }),
  reset: () => set(initialState),
}));
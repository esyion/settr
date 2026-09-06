"use client";

import { create } from "zustand";
import type { Skill, SkillVersion } from "@/lib/contracts";

/**
 * Skill 本地状态:当前查看的 skill、版本列表、加载/错误状态。
 * 纯 UI 状态,业务数据(api + 服务端)由组件按需拉取。
 */
export interface SkillState {
  selectedSkillId: string | null;
  skillList: Skill[];
  listLoading: boolean;
  listError: string | null;
  versionList: SkillVersion[];
  versionLoading: boolean;
  versionError: string | null;
  pendingUpdates: Skill[];
  notifications: Skill[];
}

interface SkillActions {
  setSelectedSkill: (id: string | null) => void;
  setSkillList: (items: Skill[]) => void;
  setListLoading: (loading: boolean) => void;
  setListError: (error: string | null) => void;
  setVersionList: (items: SkillVersion[]) => void;
  setVersionLoading: (loading: boolean) => void;
  setVersionError: (error: string | null) => void;
  setPendingUpdates: (items: Skill[]) => void;
  setNotifications: (items: Skill[]) => void;
  reset: () => void;
}

const initialState: SkillState = {
  selectedSkillId: null,
  skillList: [],
  listLoading: false,
  listError: null,
  versionList: [],
  versionLoading: false,
  versionError: null,
  pendingUpdates: [],
  notifications: [],
};

export const useSkillStore = create<SkillState & SkillActions>((set) => ({
  ...initialState,
  setSelectedSkill: (id) => set({ selectedSkillId: id }),
  setSkillList: (items) => set({ skillList: items, listError: null }),
  setListLoading: (loading) => set({ listLoading: loading }),
  setListError: (error) => set({ listError: error }),
  setVersionList: (items) => set({ versionList: items, versionError: null }),
  setVersionLoading: (loading) => set({ versionLoading: loading }),
  setVersionError: (error) => set({ versionError: error }),
  setPendingUpdates: (items) => set({ pendingUpdates: items }),
  setNotifications: (items) => set({ notifications: items }),
  reset: () => set(initialState),
}));

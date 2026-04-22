/** 跨路由的客户端 UI 偏好（表格密度、菜单折叠态等）。 */

import { create } from "zustand"

export type TableDensity = "compact" | "comfortable"

interface UiPreferencesState {
  tableDensity: TableDensity
  collapsedNavGroups: string[]

  setTableDensity: (density: TableDensity) => void
  toggleNavGroup: (groupLabel: string) => void
  reset: () => void
}

const INITIAL_STATE = {
  tableDensity: "comfortable" as TableDensity,
  collapsedNavGroups: [] as string[],
}

export const useUiPreferencesStore = create<UiPreferencesState>()((set) => ({
  ...INITIAL_STATE,

  setTableDensity: (tableDensity) => set({ tableDensity }),

  toggleNavGroup: (groupLabel) =>
    set((s) => ({
      collapsedNavGroups: s.collapsedNavGroups.includes(groupLabel)
        ? s.collapsedNavGroups.filter((g) => g !== groupLabel)
        : [...s.collapsedNavGroups, groupLabel],
    })),

  reset: () => set(INITIAL_STATE),
}))

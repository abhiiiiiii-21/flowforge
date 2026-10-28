'use client'

import { create } from 'zustand'

export type RightSidebarPanel = 'none' | 'runHistory' | 'workflowHistory' | 'assets'

interface RightSidebarState {
  panel: RightSidebarPanel
  setPanel: (panel: RightSidebarPanel) => void
  toggle: (panel: Exclude<RightSidebarPanel, 'none'>) => void
}

export const useRightSidebarStore = create<RightSidebarState>()((set, get) => ({
  panel: 'none',
  setPanel: (panel) => set({ panel }),
  toggle: (panel) =>
    set({ panel: get().panel === panel ? 'none' : panel }),
}))
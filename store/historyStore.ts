'use client'

import { create } from 'zustand'

/* ─── Types ───────────────────────────────────────────── */

export interface NodeExecutionRecord {
  nodeId: string
  nodeType?: string
  status: 'pending' | 'running' | 'success' | 'failed'
  input?: unknown
  output?: unknown
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface RunRecord {
  runId: string
  triggerRunId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  scope?: 'full' | 'partial' | 'single'
  startedAt: number
  finishedAt?: number
  nodeExecutions: NodeExecutionRecord[]
  /** Map of nodeId → nodeType, derived from the run's saved graph snapshot. */
  nodeTypes?: Record<string, string>
}

interface HistoryState {
  runs: RunRecord[]
  selectedRunId: string | null
  isOpen: boolean
  /** Incremented when a run reaches terminal state → triggers HistoryPanel re-fetch */
  refetchKey: number

  addRun: (run: RunRecord) => void
  updateRun: (runId: string, updates: Partial<RunRecord>) => void
  updateNodeExecution: (
    runId: string,
    nodeId: string,
    updates: Partial<NodeExecutionRecord>
  ) => void
  selectRun: (runId: string | null) => void
  togglePanel: () => void
  setOpen: (open: boolean) => void
}

/* ─── Store ───────────────────────────────────────────── */

export const useHistoryStore = create<HistoryState>()((set) => ({
  runs: [],
  selectedRunId: null,
  isOpen: false,
  refetchKey: 0,

  addRun: (run) =>
    set((state) => ({
      runs: [run, ...state.runs].slice(0, 50), // Keep last 50 runs
      selectedRunId: run.runId,
    })),

  updateRun: (runId, updates) =>
    set((state) => {
      const isTerminal =
        updates.status === 'completed' || updates.status === 'failed'
      return {
        runs: state.runs.map((r) =>
          r.runId === runId ? { ...r, ...updates } : r
        ),
        // Signal HistoryPanel to re-fetch from DB when a run finishes
        refetchKey: isTerminal ? state.refetchKey + 1 : state.refetchKey,
      }
    }),

  updateNodeExecution: (runId, nodeId, updates) =>
    set((state) => ({
      runs: state.runs.map((r) => {
        if (r.runId !== runId) return r

        const existing = r.nodeExecutions.find((n) => n.nodeId === nodeId)
        if (existing) {
          return {
            ...r,
            nodeExecutions: r.nodeExecutions.map((n) =>
              n.nodeId === nodeId ? { ...n, ...updates } : n
            ),
          }
        }

        return {
          ...r,
          nodeExecutions: [
            ...r.nodeExecutions,
            { nodeId, status: 'pending', ...updates },
          ],
        }
      }),
    })),

  selectRun: (runId) => set({ selectedRunId: runId }),
  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
}))
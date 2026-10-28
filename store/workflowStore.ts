'use client'

import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import { isConnectionValid, wouldCreateCycle } from '@/lib/connectionRules'
import { getDefaultLLMModel } from '@/lib/llmModels'

/* ─── Execution State ─────────────────────────────────── */

export type NodeExecutionState =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'

export type CanvasTool = 'select' | 'pan' | 'cut'

/* ─── Store Interface ─────────────────────────────────── */

interface WorkflowState {
  // ReactFlow graph state
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange

  // Node CRUD
  addNode: (type: string, position: { x: number; y: number }, data?: Record<string, unknown>) => string
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  removeNode: (nodeId: string) => void

  // Connection management
  onConnect: (connection: Connection) => boolean
  isValidConnection: (connection: Connection | Edge) => boolean

  // Execution state per node
  executionStates: Record<string, NodeExecutionState>
  nodeOutputs: Record<string, unknown>
  nodeErrors: Record<string, string>
  setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void
  setNodeOutput: (nodeId: string, output: unknown) => void
  setNodeError: (nodeId: string, error: string) => void
  resetExecutionStates: () => void

  // Current run tracking
  currentRunId: string | null
  currentTriggerRunId: string | null
  publicAccessToken: string | null
  isRunning: boolean
  /** The persisted workflow this canvas represents — used to link new runs */
  currentWorkflowId: string | null
  currentWorkflowVersionId: string | null
  currentWorkflowName: string
  setCurrentWorkflowId: (id: string | null) => void
  setCurrentWorkflowVersionId: (id: string | null) => void
  setCurrentWorkflowName: (name: string) => void
  setRunInfo: (runId: string, triggerRunId: string) => void
  setPublicAccessToken: (token: string) => void
  setIsRunning: (running: boolean) => void
  clearRunInfo: () => void

  // Graph serialization
  serializeGraph: () => {
    nodes: { id: string; type: string; data: Record<string, unknown>; position?: { x: number; y: number } }[]
    edges: { source: string; target: string; sourceHandle?: string; targetHandle?: string }[]
  }

  // Bulk operations
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void

  // Undo / Redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  pushSnapshot: () => void

  // Canvas tool (drives ReactFlow drag behavior)
  activeTool: CanvasTool
  setActiveTool: (tool: CanvasTool) => void
}

/* ─── ID Counter ──────────────────────────────────────── */

let nodeIdCounter = 0

function buildEdgeIdentity(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>): string {
  return [
    edge.source,
    edge.sourceHandle ?? 'default-source',
    edge.target,
    edge.targetHandle ?? 'default-target',
  ].join('__')
}

function buildEdgeId(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>): string {
  return `edge_${buildEdgeIdentity(edge)}`
}

function normalizeEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>()

  return edges.flatMap((edge) => {
    const id = buildEdgeId(edge)
    if (seen.has(id)) return []
    seen.add(id)

    return [
      {
        ...edge,
        id,
        type: edge.type ?? 'custom',
      },
    ]
  })
}

function generateNodeId(): string {
  nodeIdCounter++
  return `node_${Date.now()}_${nodeIdCounter}`
}

/* ─── Undo / Redo History ─────────────────────────────── */

type Snapshot = { nodes: Node[]; edges: Edge[] }
const MAX_HISTORY = 50
const undoStack: Snapshot[] = []
let redoStack: Snapshot[] = []

/* ─── Store ───────────────────────────────────────────── */

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  nodes: [],
  edges: [],
  canUndo: false,
  canRedo: false,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  /* ─── Node Operations ───────────────────────────────── */

  addNode: (type, position, data = {}) => {
    get().pushSnapshot()
    const id = generateNodeId()
    const normalizedData =
      type === 'llm'
        ? {
            outputType: 'text',
            model: getDefaultLLMModel('text'),
            ...data,
          }
        : data
    const newNode: Node = {
      id,
      type,
      position,
      data: {
        label: type,
        ...normalizedData,
      },
    }
    set((state) => ({ nodes: [...state.nodes, newNode] }))
    return id
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    }))
  },

  removeNode: (nodeId) => {
    get().pushSnapshot()
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
    }))
  },

  /* ─── Connection Management ─────────────────────────── */

  onConnect: (connection) => {
    const state = get()
    state.pushSnapshot()

    // Validate type compatibility
    if (!isConnectionValid(connection, state.nodes)) {
      return false
    }

    // Check for cycles
    if (wouldCreateCycle(state.edges, connection)) {
      return false
    }

    // The LLM `images-in` handle accepts multiple incoming edges
    // (multiple image sources stack vertically). All other handles
    // are single-input — replace any existing edge.
    const allowsMultiple = connection.targetHandle === 'images-in'

    // Reject exact duplicates (same source + handle pair) regardless
    const exactDuplicate = state.edges.some(
      (e) =>
        e.source === connection.source &&
        e.sourceHandle === connection.sourceHandle &&
        e.target === connection.target &&
        e.targetHandle === connection.targetHandle
    )
    if (exactDuplicate) return false

    const duplicate =
      !allowsMultiple &&
      state.edges.some(
        (e) =>
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle
      )
    if (duplicate) {
      // Remove existing edge to same target handle, replace with new one
      set((s) => ({
        edges: [
          ...s.edges.filter(
            (e) =>
              !(
                e.target === connection.target &&
                e.targetHandle === connection.targetHandle
              )
          ),
          {
            id: buildEdgeId(connection),
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            type: 'custom',
          },
        ],
      }))
      return true
    }

    // Add the new edge
    const newEdge: Edge = {
      id: buildEdgeId(connection),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'custom',
    }

    set((state) => ({ edges: [...state.edges, newEdge] }))
    return true
  },

  isValidConnection: (connection) => {
    const state = get()
    // Normalize undefined handles to null for type safety
    const normalized = {
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
    }

    if (!isConnectionValid(normalized, state.nodes)) {
      return false
    }

    if (wouldCreateCycle(state.edges, normalized)) {
      return false
    }

    return true
  },

  /* ─── Execution State ───────────────────────────────── */

  executionStates: {},
  nodeOutputs: {},
  nodeErrors: {},

  setNodeExecutionState: (nodeId, execState) => {
    set((state) => ({
      executionStates: { ...state.executionStates, [nodeId]: execState },
    }))
  },

  setNodeOutput: (nodeId, output) => {
    set((state) => ({
      nodeOutputs: { ...state.nodeOutputs, [nodeId]: output },
    }))
  },

  setNodeError: (nodeId, error) => {
    set((state) => ({
      nodeErrors: { ...state.nodeErrors, [nodeId]: error },
    }))
  },

  resetExecutionStates: () => {
    set({
      executionStates: {},
      nodeOutputs: {},
      nodeErrors: {},
    })
  },

  /* ─── Run Tracking ──────────────────────────────────── */

  currentRunId: null,
  currentTriggerRunId: null,
  publicAccessToken: null,
  isRunning: false,
  currentWorkflowId: null,
  currentWorkflowVersionId: null,
  currentWorkflowName: 'Untitled',

  setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
  setCurrentWorkflowVersionId: (id) => set({ currentWorkflowVersionId: id }),
  setCurrentWorkflowName: (name) => set({ currentWorkflowName: name }),

  setRunInfo: (runId, triggerRunId) => {
    set({ currentRunId: runId, currentTriggerRunId: triggerRunId })
  },

  setPublicAccessToken: (token) => {
    set({ publicAccessToken: token })
  },

  setIsRunning: (running) => {
    set({ isRunning: running })
  },

  clearRunInfo: () => {
    set({
      currentRunId: null,
      currentTriggerRunId: null,
      publicAccessToken: null,
      isRunning: false,
    })
  },

  /* ─── Serialization ─────────────────────────────────── */

  serializeGraph: () => {
    const state = get()
    const sanitizeData = (raw: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (k === 'pendingFile' || k === 'file') continue
        if (typeof File !== 'undefined' && v instanceof File) continue
        if (
          typeof v === 'string' &&
          (v.startsWith('blob:') ||
            v.startsWith('data:') ||
            /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(v))
        ) {
          continue
        }
        out[k] = v
      }
      return out
    }
    return {
      nodes: state.nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'text',
        data: sanitizeData(n.data as Record<string, unknown>),
        position: n.position,
      })),
      edges: state.edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    }
  },

  /* ─── Bulk Operations ───────────────────────────────── */

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges: normalizeEdges(edges) }),

  /* ─── Undo / Redo ──────────────────────────────────── */

  pushSnapshot: () => {
    const { nodes, edges } = get()
    undoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    })
    if (undoStack.length > MAX_HISTORY) undoStack.shift()
    redoStack = []
    set({ canUndo: true, canRedo: false })
  },

  undo: () => {
    if (undoStack.length === 0) return
    const { nodes, edges } = get()
    redoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    })
    const prev = undoStack.pop()!
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      canUndo: undoStack.length > 0,
      canRedo: true,
    })
  },

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  redo: () => {
    if (redoStack.length === 0) return
    const { nodes, edges } = get()
    undoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    })
    const next = redoStack.pop()!
    set({
      nodes: next.nodes,
      edges: next.edges,
      canUndo: true,
      canRedo: redoStack.length > 0,
    })
  },
}))
/* ─── Graph Shapes ────────────────────────────────── */

export interface GraphNode {
  id: string
  type: string
  data: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/* ─── DAG Structures ──────────────────────────────── */

/** Adjacency list: nodeId → children */
export type AdjacencyList = Record<string, string[]>

/** In-degree map: nodeId → number of incoming edges */
export type InDegreeMap = Record<string, number>

export interface DAG {
  adj: AdjacencyList
  inDegree: InDegreeMap
}

/* ─── Workflow Events (streamed to frontend) ──────── */

export type WorkflowEvent =
  | { type: "node_start";    nodeId: string }
  | { type: "node_complete"; nodeId: string; output: unknown }
  | { type: "node_failed";   nodeId: string; error: string }
  | { type: "workflow_done" }

/* ─── Node Execution Payload ──────────────────────── */

export interface NodeExecutionPayload {
  nodeId: string
  nodeType: string
  data: Record<string, unknown>
  inputs: Record<string, unknown>
}

export interface NodeExecutionResult {
  output: unknown
}

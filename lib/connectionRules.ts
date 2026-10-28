/**
 * Type-safe connection validation and DAG cycle detection.
 *
 * Enforces the connection rules from design.md §11 and
 * prevents cycles per §9.
 */

/* ─── Handle Definitions ─────────────────────────────── */

export type HandleDataType = 'text' | 'image' | 'video'

export interface NodeHandleSpec {
  inputs: { id: string; type: HandleDataType }[]
  outputs: { id: string; type: HandleDataType }[]
}

/**
 * Every node type's input/output handle specification.
 * This is the single source of truth for what can connect to what.
 */
export const NODE_HANDLE_SPECS: Record<string, NodeHandleSpec> = {
  text: {
    inputs: [],
    outputs: [{ id: 'text-out', type: 'text' }],
  },
  upload_image: {
    inputs: [],
    outputs: [{ id: 'image-out', type: 'image' }],
  },
  upload_video: {
    inputs: [],
    outputs: [{ id: 'video-out', type: 'video' }],
  },
  llm: {
    inputs: [
      { id: 'system-prompt-in', type: 'text' },
      { id: 'user-message-in', type: 'text' },
      { id: 'images-in', type: 'image' },
    ],
    outputs: [
      { id: 'text-out', type: 'text' },
      { id: 'image-out', type: 'image' },
    ],
  },
  crop_image: {
    inputs: [
      { id: 'image-in', type: 'image' },
    ],
    outputs: [{ id: 'image-out', type: 'image' }],
  },
  extract_frame: {
    inputs: [{ id: 'video-in', type: 'video' }],
    outputs: [{ id: 'image-out', type: 'image' }],
  },
}

/* ─── Connection Validation ───────────────────────────── */

interface ConnectionParams {
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
}

interface NodeLike {
  id: string
  type?: string
}

interface EdgeLike {
  source: string
  target: string
}

/**
 * Get the data type of a handle from its node type and handle id.
 */
export function getHandleType(
  nodeType: string,
  handleId: string,
  direction: 'input' | 'output'
): HandleDataType | null {
  const spec = NODE_HANDLE_SPECS[nodeType]
  if (!spec) return null

  const handles = direction === 'input' ? spec.inputs : spec.outputs
  const handle = handles.find((h) => h.id === handleId)
  return handle?.type ?? null
}

/**
 * Check if a proposed connection is valid based on type rules.
 * Returns true if the source output type matches the target input type.
 */
export function isConnectionValid(
  connection: ConnectionParams,
  nodes: NodeLike[]
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection

  // Can't connect to self
  if (source === target) return false

  // Both handles must be specified
  if (!sourceHandle || !targetHandle) return false

  const sourceNode = nodes.find((n) => n.id === source)
  const targetNode = nodes.find((n) => n.id === target)
  if (!sourceNode?.type || !targetNode?.type) return false

  const sourceType = getHandleType(sourceNode.type, sourceHandle, 'output')
  const targetType = getHandleType(targetNode.type, targetHandle, 'input')

  if (!sourceType || !targetType) return false

  // Types must match exactly
  return sourceType === targetType
}

/* ─── Cycle Detection ─────────────────────────────────── */

/**
 * DFS-based cycle detection.
 * Returns true if adding the proposed edge would create a cycle.
 */
export function wouldCreateCycle(
  edges: EdgeLike[],
  newEdge: { source: string; target: string }
): boolean {
  // Build adjacency list including the new edge
  const adj: Record<string, string[]> = {}

  for (const edge of edges) {
    if (!adj[edge.source]) adj[edge.source] = []
    adj[edge.source].push(edge.target)
  }

  // Add the proposed edge
  if (!adj[newEdge.source]) adj[newEdge.source] = []
  adj[newEdge.source].push(newEdge.target)

  // DFS from target to see if we can reach source (= cycle)
  const visited = new Set<string>()

  function dfs(node: string): boolean {
    if (node === newEdge.source) return true
    if (visited.has(node)) return false
    visited.add(node)

    for (const neighbor of adj[node] ?? []) {
      if (dfs(neighbor)) return true
    }
    return false
  }

  return dfs(newEdge.target)
}

/* ─── Node Palette ────────────────────────────────────── */

export interface NodePaletteItem {
  type: string
  label: string
  description: string
  icon: string // lucide icon name
  category: 'input' | 'processing' | 'output'
}

export const NODE_PALETTE: NodePaletteItem[] = [
  {
    type: 'text',
    label: 'Text Input',
    description: 'Manual text input',
    icon: 'Type',
    category: 'input',
  },
  {
    type: 'upload_image',
    label: 'Upload Image',
    description: 'Upload or drop an image',
    icon: 'Image',
    category: 'input',
  },
  {
    type: 'upload_video',
    label: 'Upload Video',
    description: 'Upload or drop a video',
    icon: 'Video',
    category: 'input',
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Large Language Model',
    icon: 'Brain',
    category: 'processing',
  },
  {
    type: 'crop_image',
    label: 'Crop Image',
    description: 'Crop a region from an image',
    icon: 'Crop',
    category: 'processing',
  },
  {
    type: 'extract_frame',
    label: 'Extract Frame',
    description: 'Extract a frame from video',
    icon: 'Film',
    category: 'processing',
  },
]
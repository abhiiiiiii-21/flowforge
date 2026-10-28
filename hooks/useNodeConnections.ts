'use client'

import { useMemo } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'

/**
 * For a given node, determine which of its input handles are connected
 * and what upstream values are available.
 */
export function useNodeConnections(nodeId: string) {
  const edges = useWorkflowStore((s) => s.edges)
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs)

  return useMemo(() => {
    // Find all edges targeting this node
    const incomingEdges = edges.filter((e) => e.target === nodeId)

    // Map of targetHandle → { sourceNodeId, sourceHandle, value }
    const connectedInputs: Record<
      string,
      { sourceNodeId: string; sourceHandle: string | null | undefined; value: unknown }
    > = {}

    for (const edge of incomingEdges) {
      if (edge.targetHandle) {
        connectedInputs[edge.targetHandle] = {
          sourceNodeId: edge.source,
          sourceHandle: edge.sourceHandle,
          value: nodeOutputs[edge.source],
        }
      }
    }

    return {
      /** All incoming edges to this node */
      incomingEdges,
      /** Map of connected input handles with their upstream data */
      connectedInputs,
      /** Check if a specific input handle is connected */
      isConnected: (handleId: string) => handleId in connectedInputs,
      /** Get the upstream value for a connected input */
      getUpstreamValue: (handleId: string) => connectedInputs[handleId]?.value,
    }
  }, [edges, nodeId, nodeOutputs])
}

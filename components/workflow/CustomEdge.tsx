'use client'

import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useWorkflowStore } from '@/store/workflowStore'

/**
 * Custom edge with animated flow during execution.
 * Shows dashed animation when the source node is running.
 */
function CustomEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  source,
}: EdgeProps) {
  const executionState = useWorkflowStore(
    (s) => s.executionStates[source] ?? 'idle'
  )

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const isAnimated = executionState === 'running'
  const isComplete = executionState === 'success'

  const strokeColor = selected
    ? 'var(--accent)'
    : isComplete
      ? 'var(--success)'
      : isAnimated
        ? 'var(--accent)'
        : 'var(--border-strong)'

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: isAnimated ? '5 5' : 'none',
        animation: isAnimated ? 'flowDash 1s linear infinite' : 'none',
        transition: 'stroke 200ms ease',
      }}
    />
  )
}

export const CustomEdge = memo(CustomEdgeInner)

'use client'

import { useEffect, useRef } from 'react'
import { useRealtimeRunWithStreams } from '@trigger.dev/react-hooks'
import type { workflowTask } from '@/src/trigger/workflow.task'
import type { WorkflowEvent } from '@/src/trigger/engine/types'

/**
 * Stream type map — must match the stream IDs used in the Trigger task.
 * `workflow-events` corresponds to `workflowEvents` defined in streams.ts.
 */
type WorkflowStreams = {
  'workflow-events': WorkflowEvent
}

interface Props {
  triggerRunId: string
  accessToken: string
  onEvent: (event: WorkflowEvent) => void
  /** Called when the Trigger.dev run reaches a terminal status */
  onRunComplete?: (status: string) => void
}

/**
 * Headless component that subscribes to the Trigger.dev realtime
 * run + stream. Processes incoming WorkflowEvent parts and
 * forwards them to the parent via `onEvent`.
 *
 * Mount this conditionally only when triggerRunId and accessToken
 * are available (i.e. a run is active).
 */
export function RealtimeStreamHandler({
  triggerRunId,
  accessToken,
  onEvent,
  onRunComplete,
}: Props) {
  // Use refs so the effect always calls the latest callback
  // without re-subscribing on every render.
  const onEventRef = useRef(onEvent)
  const onRunCompleteRef = useRef(onRunComplete)

  useEffect(() => {
    onEventRef.current = onEvent
    onRunCompleteRef.current = onRunComplete
  }, [onEvent, onRunComplete])

  // Track how many events we've already processed to avoid
  // re-processing the accumulated `parts` array on every update.
  const processedIndexRef = useRef(0)

  const { run, streams, error } = useRealtimeRunWithStreams<
    typeof workflowTask,
    WorkflowStreams
  >(triggerRunId, {
    accessToken,
    enabled: true,
  })

  // Process new stream events as they arrive
  const parts = streams['workflow-events'] ?? []

  useEffect(() => {
    if (parts.length <= processedIndexRef.current) return

    for (let i = processedIndexRef.current; i < parts.length; i++) {
      onEventRef.current(parts[i])
    }
    processedIndexRef.current = parts.length
  }, [parts])

  // Detect terminal run status from the Electric SQL subscription
  const prevStatusRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!run) return
    const status = run.status
    const prev = prevStatusRef.current
    prevStatusRef.current = status

    // Only fire once on the transition to a terminal state
    if (prev !== status && (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED')) {
      onRunCompleteRef.current?.(status)
    }
  }, [run])

  // Reset processed index when triggerRunId changes (new run)
  useEffect(() => {
    processedIndexRef.current = 0
  }, [triggerRunId])

  // Log stream errors for debugging (non-fatal — polling backs us up)
  useEffect(() => {
    if (error) {
      console.warn('[RealtimeStreamHandler] stream error:', error.message)
    }
  }, [error])

  return null // Headless — no UI
}

'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useHistoryStore } from '@/store/historyStore'
import toast from 'react-hot-toast'
import type { WorkflowEvent } from '@/src/trigger/engine/types'

function normalizeWorkflowName(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'Untitled'
}

/**
 * Orchestrates the full workflow execution flow:
 * 1. Serialize graph → POST /api/run-workflow
 * 2. Get public access token → POST /api/auth/realtime
 * 3. Poll for stream events (using Trigger.dev's useRealtimeRunWithStreams
 *    when available; falls back to polling /api/run-status for resilience)
 * 4. Process events → update execution states in store
 *
 * Per frontend_integration.md, we use useRealtimeRunWithStreams.
 * However, since the hook requires conditional rendering and the
 * Trigger.dev connection may not be configured, we implement a
 * wrapper that handles both realtime and fallback gracefully.
 */
export function useWorkflowExecution() {
  const {
    serializeGraph,
    setRunInfo,
    setPublicAccessToken,
    setIsRunning,
    clearRunInfo,
    setNodeExecutionState,
    setNodeOutput,
    setNodeError,
    isRunning,
    currentRunId,
    currentTriggerRunId,
    publicAccessToken,
    nodes,
    nodeOutputs,
    currentWorkflowId,
    currentWorkflowVersionId,
    currentWorkflowName,
    setCurrentWorkflowId,
    setCurrentWorkflowVersionId,
  } = useWorkflowStore()

  const { addRun, updateRun, updateNodeExecution } = useHistoryStore()

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startStatusPollingRef = useRef<(runId: string) => void>(() => {})
  const processedEventsRef = useRef<Set<string>>(new Set())
  // Ancestor nodes included in a partial run only to forward their cached
  // output. The server still emits start/complete events for them — we
  // suppress those events here so their UI state doesn't flicker.
  const cachedNodeIdsRef = useRef<Set<string>>(new Set())

  /**
   * Start the workflow execution.
   */
  const executeWorkflow = useCallback(async () => {
    if (isRunning) {
      toast.error('Workflow is already running')
      return
    }

    if (nodes.length === 0) {
      toast.error('Add some nodes before running')
      return
    }

    try {
      // Only clear states for nodes that will be executed (not all)
      processedEventsRef.current.clear()
      cachedNodeIdsRef.current = new Set()
      setIsRunning(true)

      // Step 1: Trigger the workflow
      // Check if we should run only selected nodes
      const selectedNodes = nodes.filter((n) => n.selected)
      const useSelected = selectedNodes.length > 0 && selectedNodes.length < nodes.length
      const scope = useSelected
        ? selectedNodes.length === 1 ? 'single' : 'partial'
        : 'full'

      const fullGraph = serializeGraph()
      let graph = fullGraph

      if (useSelected) {
        const selectedIds = new Set(selectedNodes.map((n) => n.id))

        // Walk upstream from the selection set, collecting every ancestor
        // that feeds into it. Ancestors aren't re-executed — we stamp each
        // one's last-known output (from Zustand) onto its data as
        // __cachedOutput, which the server task short-circuits on.
        const ancestorIds = new Set<string>()
        const queue = [...selectedIds]
        while (queue.length) {
          const id = queue.shift()!
          for (const e of fullGraph.edges) {
            if (e.target === id && !selectedIds.has(e.source) && !ancestorIds.has(e.source)) {
              ancestorIds.add(e.source)
              queue.push(e.source)
            }
          }
        }

        // Block the run if any ancestor has no cached output to forward.
        const missing: string[] = []
        for (const aId of ancestorIds) {
          if (nodeOutputs[aId] === undefined) missing.push(aId)
        }
        if (missing.length > 0) {
          setIsRunning(false)
          toast.error(
            `Upstream node${missing.length > 1 ? 's' : ''} not yet run — run the full workflow first`,
            { id: 'workflow-start' }
          )
          return
        }

        // Remember which IDs are cached pass-throughs so we can suppress
        // their execution events downstream.
        cachedNodeIdsRef.current = new Set(ancestorIds)

        const includedIds = new Set<string>([...selectedIds, ...ancestorIds])
        graph = {
          nodes: fullGraph.nodes
            .filter((n) => includedIds.has(n.id))
            .map((n) =>
              ancestorIds.has(n.id)
                ? { ...n, data: { ...n.data, __cachedOutput: nodeOutputs[n.id] } }
                : n
            ),
          edges: fullGraph.edges.filter(
            (e) => includedIds.has(e.source) && includedIds.has(e.target)
          ),
        }
      }

      toast.loading(`Starting ${scope} run...`, { id: 'workflow-start' })

      // Reset only the nodes that will actually execute. Cached ancestor
      // nodes stay in their prior state — they aren't really running.
      // We mark them as 'pending' (queued); each node flips to 'running'
      // only when its node_start event arrives, so edge animations light
      // up one node at a time instead of all at once.
      const runNodeIds = graph.nodes
        .map((n) => n.id)
        .filter((id) => !cachedNodeIdsRef.current.has(id))
      for (const nid of runNodeIds) {
        setNodeExecutionState(nid, 'pending')
        setNodeError(nid, '')
      }

      // Flush a save *now* so the run uses the live graph (latest model
       // selection, prompts, etc.) — autosave's 6s debounce would otherwise
       // make Run pick up a stale WorkflowVersion.
      let versionIdForRun = currentWorkflowVersionId
      const workflowName = normalizeWorkflowName(currentWorkflowName)
      try {
        const isNew = !currentWorkflowId
        const saveRes = await fetch(
          isNew ? '/api/workflows' : `/api/workflows/${currentWorkflowId}`,
          {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              { graph: fullGraph, name: workflowName },
            ),
          },
        )
        if (saveRes.ok) {
          const saved = await saveRes.json()
          if (saved.id && !currentWorkflowId) setCurrentWorkflowId(saved.id)
          if (saved.versionId) {
            versionIdForRun = saved.versionId
            setCurrentWorkflowVersionId(saved.versionId)
          }
        }
      } catch (err) {
        console.warn('[run] pre-run save failed, using last-known version', err)
      }

      if (!versionIdForRun) {
        setIsRunning(false)
        toast.error('Save/select a workflow version first', { id: 'workflow-start' })
        return
      }

      const runRes = await fetch('/api/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowVersionId: versionIdForRun,
          scope,
          selectedNodeIds: useSelected ? selectedNodes.map((n) => n.id) : undefined,
        }),
      })

      if (!runRes.ok) {
        const err = await runRes.json()
        throw new Error(err.error || 'Failed to start workflow')
      }

      const { runId, triggerRunId } = await runRes.json()
      setRunInfo(runId, triggerRunId)

      // Add to history
      const targetNodes = useSelected ? selectedNodes : nodes
      const nodeTypes: Record<string, string> = {}
      for (const n of targetNodes) {
        if (n.type) nodeTypes[n.id] = n.type
      }
      addRun({
        runId,
        triggerRunId,
        status: 'running',
        startedAt: Date.now(),
        scope,
        nodeTypes,
        nodeExecutions: targetNodes.map((n) => ({
          nodeId: n.id,
          nodeType: n.type,
          status: 'pending',
        })),
      })

      // Step 2: Get public access token
      const authRes = await fetch('/api/auth/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerRunId }),
      })

      if (!authRes.ok) {
        throw new Error('Failed to get access token')
      }

      const { publicAccessToken: token } = await authRes.json()
      setPublicAccessToken(token)

      toast.success('Workflow started!', { id: 'workflow-start' })

      // Step 3: Start polling for run status updates
      // This provides resilience even without realtime connection
      startStatusPollingRef.current(runId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(message, { id: 'workflow-start' })
      setIsRunning(false)
      clearRunInfo()
    }
  }, [
    isRunning,
    nodes,
    nodeOutputs,
    currentWorkflowId,
    currentWorkflowVersionId,
    currentWorkflowName,
    setIsRunning,
    setNodeExecutionState,
    setNodeError,
    serializeGraph,
    setRunInfo,
    addRun,
    setPublicAccessToken,
    clearRunInfo,
    setCurrentWorkflowId,
    setCurrentWorkflowVersionId,
  ])

  /**
   * Poll /api/run-status/:runId for state updates.
   * This acts as a fallback/complement to realtime streams.
   */
  const startStatusPolling = useCallback(
    (runId: string) => {
      // Clear any existing polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }

      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/run-status/${runId}`)
          if (!res.ok) return

          const data = await res.json()

          // Update node execution states
          if (data.executions) {
            for (const exec of data.executions) {
              // Skip cached pass-through nodes — they didn't actually run.
              if (cachedNodeIdsRef.current.has(exec.nodeId)) continue

              const eventKey = `${exec.nodeId}_${exec.status}`
              if (processedEventsRef.current.has(eventKey)) continue
              processedEventsRef.current.add(eventKey)

              const stateMap: Record<
                string,
                'idle' | 'pending' | 'running' | 'success' | 'failed'
              > = {
                PENDING: 'pending',
                RUNNING: 'running',
                SUCCESS: 'success',
                FAILED: 'failed',
              }

              const execState = stateMap[exec.status] ?? 'idle'
              setNodeExecutionState(exec.nodeId, execState)
              updateNodeExecution(runId, exec.nodeId, {
                status: execState === 'idle' ? 'pending' : execState,
              })

              if (exec.output != null) {
                // Unwrap { output: value } from DB
                const raw = typeof exec.output === 'object' && exec.output !== null && 'output' in exec.output
                  ? (exec.output as Record<string, unknown>).output
                  : exec.output
                setNodeOutput(exec.nodeId, raw)
                updateNodeExecution(runId, exec.nodeId, { output: raw })
              }

              if (exec.error) {
                setNodeError(exec.nodeId, exec.error)
                updateNodeExecution(runId, exec.nodeId, { error: exec.error })
              }
            }
          }

          // Check if run is done
          if (data.run?.status === 'COMPLETED' || data.run?.status === 'FAILED') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }

            const isSuccess = data.run.status === 'COMPLETED'
            updateRun(runId, {
              status: isSuccess ? 'completed' : 'failed',
              finishedAt: Date.now(),
            })

            setIsRunning(false)

            if (isSuccess) {
              toast.success('Workflow completed!')
            } else {
              toast.error('Workflow failed')
            }
          }
        } catch {
          // Silent failure for polling — will retry next interval
        }
      }, 5000) // Backup polling (5s) — realtime stream is the primary path
    },
    [setNodeExecutionState, setNodeOutput, setNodeError, updateRun, updateNodeExecution, setIsRunning]
  )

  useEffect(() => {
    startStatusPollingRef.current = startStatusPolling
  }, [startStatusPolling])

  /**
   * Process a realtime workflow event from Trigger.dev streams.
   * This is called by the RealtimeStreamHandler component.
   */
  const processEvent = useCallback(
    (event: WorkflowEvent) => {
      const runId = currentRunId
      if (!runId) return

      let activeEvent: WorkflowEvent = event
      if (!activeEvent || typeof activeEvent !== 'object') {
        try {
          if (typeof activeEvent === 'string') {
            activeEvent = JSON.parse(activeEvent) as WorkflowEvent
            if (!activeEvent || typeof activeEvent !== 'object') return
          } else {
            return
          }
        } catch {
          return // Ignore invalid JSON strings
        }
      }

      // Suppress events for cached ancestor nodes in partial runs.
      if ('nodeId' in activeEvent && typeof activeEvent.nodeId === 'string' && cachedNodeIdsRef.current.has(activeEvent.nodeId)) {
        return
      }

      switch (event.type) {
        case 'node_start':
          setNodeExecutionState(event.nodeId, 'running')
          updateNodeExecution(runId, event.nodeId, {
            status: 'running',
            startedAt: Date.now(),
          })
          break

        case 'node_complete':
          setNodeExecutionState(event.nodeId, 'success')
          setNodeOutput(event.nodeId, event.output)
          updateNodeExecution(runId, event.nodeId, {
            status: 'success',
            output: event.output,
            finishedAt: Date.now(),
          })
          break

        case 'node_failed':
          setNodeExecutionState(event.nodeId, 'failed')
          setNodeError(event.nodeId, event.error)
          updateNodeExecution(runId, event.nodeId, {
            status: 'failed',
            error: event.error,
            finishedAt: Date.now(),
          })
          toast.error(`Node failed: ${event.error}`)
          break

        case 'workflow_done':
          updateRun(runId, {
            status: 'completed',
            finishedAt: Date.now(),
          })
          setIsRunning(false)
          toast.success('Workflow completed!')

          // Stop polling if active
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          break
      }
    },
    [
      currentRunId,
      setNodeExecutionState,
      setNodeOutput,
      setNodeError,
      updateNodeExecution,
      updateRun,
      setIsRunning,
    ]
  )

  /**
   * Stop a running workflow (cancels polling and marks as stopped).
   */
  const stopWorkflow = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    if (currentRunId) {
      updateRun(currentRunId, {
        status: 'failed',
        finishedAt: Date.now(),
      })
    }

    setIsRunning(false)
    clearRunInfo()
    toast('Workflow stopped', { icon: '⏹' })
  }, [currentRunId, updateRun, setIsRunning, clearRunInfo])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  return {
    executeWorkflow,
    stopWorkflow,
    processEvent,
    isRunning,
    currentRunId,
    currentTriggerRunId,
    publicAccessToken,
  }
}
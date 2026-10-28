'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'

function normalizeWorkflowName(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'Untitled'
}

/**
 * Auto-saves the workflow to the server after 6 seconds of inactivity.
 * Also loads the last saved workflow on initial mount (sync with DB on reload).
 */
export function useAutoSave() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const serializeGraph = useWorkflowStore((s) => s.serializeGraph)
  const setNodes = useWorkflowStore((s) => s.setNodes)
  const setEdges = useWorkflowStore((s) => s.setEdges)
  const setNodeOutput = useWorkflowStore((s) => s.setNodeOutput)
  const setNodeExecutionState = useWorkflowStore((s) => s.setNodeExecutionState)
  const setCurrentWorkflowId = useWorkflowStore((s) => s.setCurrentWorkflowId)
  const setCurrentWorkflowVersionId = useWorkflowStore((s) => s.setCurrentWorkflowVersionId)
  const setCurrentWorkflowName = useWorkflowStore((s) => s.setCurrentWorkflowName)
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId)
  const currentWorkflowName = useWorkflowStore((s) => s.currentWorkflowName)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  const workflowIdRef = useRef<string | null>(null)
  const prevNodeCountRef = useRef(0)
  const [isLoading, setIsLoading] = useState(true)

  // Keep internal refs in sync with store, so autosave always versions the same workflow.
  useEffect(() => {
    if (currentWorkflowId) {
      workflowIdRef.current = currentWorkflowId
    }
  }, [currentWorkflowId])

  /**
   * Load the most recent workflow from DB on mount.
   */
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    ;(async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const forceNew = params.get('new') === '1'
        if (forceNew) {
          workflowIdRef.current = null
          setCurrentWorkflowId(null)
          setCurrentWorkflowVersionId(null)
          setCurrentWorkflowName('Untitled')
          setNodes([])
          setEdges([])
          lastSavedRef.current = ''
          prevNodeCountRef.current = 0
          return
        }

        const res = await fetch('/api/workflows')
        if (res.status === 401) {
          window.location.href = '/sign-in'
          return
        }
        if (!res.ok) return

        const { workflows } = await res.json()
        if (!workflows || workflows.length === 0) return

        const requestedWorkflowId = params.get('workflowId')
        const picked = requestedWorkflowId
          ? workflows.find((w: { id: string }) => w.id === requestedWorkflowId) ?? workflows[0]
          : workflows[0]

        workflowIdRef.current = picked.id
        setCurrentWorkflowId(picked.id)

        const detailRes = await fetch(`/api/workflows/${picked.id}?mode=latest`)
        if (!detailRes.ok) return

        const detailJson = await detailRes.json()
        const workflow = detailJson.workflow
        const selectedVersion = detailJson.selectedVersion as { id: string } | null
        const latestByNode = (detailJson.latestByNode ?? {}) as Record<
          string,
          { status: string; output: unknown; error: string | null }
        >
        setCurrentWorkflowVersionId(selectedVersion?.id ?? null)
        setCurrentWorkflowName(normalizeWorkflowName(workflow?.name))
        if (!workflow?.graph) return

        const graph = workflow.graph as {
          nodes: Array<{ id: string; type: string; data: Record<string, unknown>; position?: { x: number; y: number } }>
          edges: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>
        }

        if (graph.nodes && graph.nodes.length > 0) {
          const loadedNodes = graph.nodes.map(
            (n, i: number) => ({
              id: n.id,
              type: n.type,
              data: n.data,
              position: n.position ?? { x: 200 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 200 },
            })
          )

          setNodes(loadedNodes)
          setEdges(
            (graph.edges ?? []).map(
              (e) => ({
                id: `edge_${e.source}_${e.target}`,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
                type: 'custom',
              })
            )
          )

          lastSavedRef.current = JSON.stringify(graph)
          console.log('[autoSave] Loaded workflow from DB:', workflow.name)
        }

        // Hydrate prior node outputs directly from the DB. The API walks
        // the recent runs newest→oldest and returns the latest result for
        // each node, so partial runs also keep their downstream outputs.
        for (const [nid, exec] of Object.entries(latestByNode)) {
          // NodeExecution.output is stored as { output: <value> } from the
          // task result — unwrap it to match the live-run state shape.
          const raw =
            exec.output && typeof exec.output === 'object' && 'output' in (exec.output as Record<string, unknown>)
              ? (exec.output as Record<string, unknown>).output
              : exec.output
          if (raw != null) setNodeOutput(nid, raw)

          const uiState =
            exec.status === 'SUCCESS'
              ? 'success'
              : exec.status === 'FAILED'
                ? 'failed'
                : 'idle'
          setNodeExecutionState(nid, uiState)
        }
      } catch (err) {
        console.log('[autoSave] No saved workflow to restore:', err)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [setNodes, setEdges, setNodeOutput, setNodeExecutionState, setCurrentWorkflowId, setCurrentWorkflowVersionId, setCurrentWorkflowName])

  /**
   * Debounced auto-save: triggers 6s after last change.
   */
  const saveToServer = useCallback(async () => {
    if (nodes.length === 0) return

    const graph = serializeGraph()
    const serialized = JSON.stringify(graph)
    const workflowName = normalizeWorkflowName(currentWorkflowName)

    // Skip if nothing changed
    if (serialized === lastSavedRef.current) return
    lastSavedRef.current = serialized

    try {
      if (workflowIdRef.current) {
        // Update existing workflow
        const res = await fetch(`/api/workflows/${workflowIdRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graph, name: workflowName }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.versionId) setCurrentWorkflowVersionId(data.versionId)
        }
      } else {
        // Create new workflow
        const res = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graph, name: workflowName }),
        })
        if (res.ok) {
          const data = await res.json()
          workflowIdRef.current = data.id
          setCurrentWorkflowId(data.id)
          setCurrentWorkflowVersionId(data.versionId ?? null)
        }
      }
      console.log('[autoSave] Saved')
    } catch (err) {
      console.error('[autoSave] Failed:', err)
    }
  }, [currentWorkflowName, nodes, serializeGraph, setCurrentWorkflowId, setCurrentWorkflowVersionId])

  // Debounce: 6 seconds after last nodes/edges change.
  // But when the workflow goes from 0 → N nodes (first node added, or a
  // graph loaded from DB), save immediately so the Workflow row exists
  // right away — no waiting 6s hoping the user doesn't close the tab.
  useEffect(() => {
    if (!hasLoadedRef.current) return
    if (nodes.length === 0) {
      prevNodeCountRef.current = 0
      return
    }

    const firstNode = prevNodeCountRef.current === 0
    prevNodeCountRef.current = nodes.length

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (firstNode && !workflowIdRef.current) {
      // Create the workflow row immediately on first node.
      saveToServer()
      return
    }

    timerRef.current = setTimeout(() => {
      saveToServer()
    }, 6000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [nodes, edges, saveToServer])

  // Flush on tab close / navigation away. `keepalive: true` lets the
  // request survive the page tearing down — best-effort, no awaiting.
  useEffect(() => {
    const flush = () => {
      if (!hasLoadedRef.current) return
      if (nodes.length === 0) return
      const graph = serializeGraph()
      const serialized = JSON.stringify(graph)
      const workflowName = normalizeWorkflowName(currentWorkflowName)
      if (serialized === lastSavedRef.current) return
      lastSavedRef.current = serialized

      try {
        if (workflowIdRef.current) {
          fetch(`/api/workflows/${workflowIdRef.current}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph, name: workflowName }),
            keepalive: true,
          })
        } else {
          fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph, name: workflowName }),
            keepalive: true,
          })
        }
      } catch {
        // Best-effort; nothing to do if the browser blocks it.
      }
    }

    // `visibilitychange → hidden` is more reliable than beforeunload on
    // mobile and when the tab is backgrounded rather than closed.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [currentWorkflowName, nodes, serializeGraph])

  return { isLoading }
}
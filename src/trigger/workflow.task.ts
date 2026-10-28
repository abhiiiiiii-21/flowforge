import { task, logger } from "@trigger.dev/sdk/v3"
import { buildDAG, findRootNodes } from "./engine/dag"
import { workflowEvents } from "./streams"
import { executeNodeTask } from "./node.task"
import {
  markNodeAsRunning,
  markNodeAsCompleted,
  markNodeAsFailed,
} from "@/lib/db/node.repository"
import { markRunAsCompleted, markRunAsFailed } from "@/lib/db/run.repository"
import type { Graph } from "./engine/types"

/* ─── Payload ──────────────────────────────────────── */

interface WorkflowPayload {
  runId: string
  graph: Graph
}

/* ─── Orchestrator Task ────────────────────────────── */

/**
 * The main workflow orchestrator.
 *
 * 1. Builds a DAG from the graph.
 * 2. Finds root nodes (zero in-degree).
 * 3. Executes each "level" in parallel via `batchTriggerAndWait`.
 * 4. After each batch, decrements in-degrees and enqueues the next level.
 * 5. Emits typed events via `workflowEvents` stream for the frontend.
 * 6. Writes every state change to the database for refresh resilience.
 *
 * The parent task is SUSPENDED (free compute) while child nodes execute.
 */
export const workflowTask = task({
  id: "workflow.run",
  maxDuration: 3600, // 1 hour max for entire workflow

  run: async (payload: WorkflowPayload) => {
    const { runId, graph } = payload
    const { adj, inDegree } = buildDAG(graph.nodes, graph.edges)
    const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]))
    const cachedNodeIds = new Set(
      graph.nodes
        .filter((node) => node.data.__cachedOutput !== undefined)
        .map((node) => node.id)
    )

    /** In-memory outputs map — only for passing data between nodes */
    const outputs: Record<string, unknown> = {}
    for (const nodeId of cachedNodeIds) {
      outputs[nodeId] = nodeMap.get(nodeId)?.data.__cachedOutput
    }

    let queue = findRootNodes(inDegree)
    let hasFailed = false

    while (queue.length > 0) {
      const batch = [...queue]
      queue = []
      const cachedBatch = batch.filter((nodeId) => cachedNodeIds.has(nodeId))
      const executableBatch = batch.filter((nodeId) => !cachedNodeIds.has(nodeId))

      for (const nodeId of cachedBatch) {
        advanceChildren(adj, inDegree, nodeId, queue)
      }

      if (executableBatch.length === 0) {
        continue
      }

      // ── Compute inputs per node (used for both DB + child payloads) ──
      const batchInputs: Record<string, Record<string, unknown>> = {}
      for (const nodeId of executableBatch) {
        batchInputs[nodeId] = gatherInputs(nodeId, outputs, graph)
      }

      // ── Emit start events & mark DB ──
      await emitBatchStart(runId, executableBatch, batchInputs)

      // ── Execute batch via child tasks (parent suspends here) ──
      const batchResults = await executeBatch(
        runId,
        executableBatch,
        outputs,
        graph,
        batchInputs
      )

      // ── Process results: update DB, emit events, advance DAG ──
      for (const result of batchResults) {
        if (result.success) {
          advanceChildren(adj, inDegree, result.nodeId, queue)
        } else {
          hasFailed = true
        }
      }
    }

    // ── Workflow complete ──
    if (hasFailed) {
      await markRunAsFailed(runId)
      logger.error(`Workflow ${runId} failed`)
    } else {
      await markRunAsCompleted(runId)
      await workflowEvents.append({ type: "workflow_done" })
      logger.info(`Workflow ${runId} completed`)
    }
  },
})

/* ─── Helpers ──────────────────────────────────────── */

interface BatchResult {
  nodeId: string
  success: boolean
}

function unwrapNodeTaskOutput(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "output" in value
  ) {
    return (value as { output: unknown }).output
  }

  return value
}

/**
 * Emit node_start events and mark each node as RUNNING in the DB.
 */
async function emitBatchStart(
  runId: string,
  batch: string[],
  inputs: Record<string, Record<string, unknown>>
) {
  await Promise.all(
    batch.map(async (nodeId) => {
      await markNodeAsRunning(runId, nodeId, inputs[nodeId])
      await workflowEvents.append({ type: "node_start", nodeId })
    })
  )
}

/**
 * Execute a batch of nodes using `batchTriggerAndWait`.
 *
 * Per Trigger.dev docs: DON'T use `Promise.all` with `triggerAndWait`.
 * Use `batchTriggerAndWait` instead — the parent suspends while
 * all child tasks run, so orchestrator compute is free.
 */
async function executeBatch(
  runId: string,
  batch: string[],
  outputs: Record<string, unknown>,
  graph: Graph,
  precomputedInputs: Record<string, Record<string, unknown>>
): Promise<BatchResult[]> {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))

  const batchPayloads = batch.map((nodeId) => {
    const node = nodeMap.get(nodeId)
    return {
      payload: {
        nodeId,
        nodeType: node?.type ?? 'text',
        data: node?.data ?? {},
        inputs: precomputedInputs[nodeId] ?? gatherInputs(nodeId, outputs, graph),
      },
    }
  })

  const batchResult = await executeNodeTask.batchTriggerAndWait(batchPayloads)

  const results: BatchResult[] = []

  for (const run of batchResult.runs) {
    const nodeId = batch[results.length] // runs come back in order

    if (run.ok) {
      const rawOutput = unwrapNodeTaskOutput(run.output)
      outputs[nodeId] = rawOutput
      await markNodeAsCompleted(runId, nodeId, rawOutput)
      await workflowEvents.append({
        type: "node_complete",
        nodeId,
        output: rawOutput,
      })
      results.push({ nodeId, success: true })
    } else {
      const errorMsg = String(run.error)
      await markNodeAsFailed(runId, nodeId, errorMsg)
      await workflowEvents.append({
        type: "node_failed",
        nodeId,
        error: errorMsg,
      })
      results.push({ nodeId, success: false })

      logger.error(`Node ${nodeId} failed`, { error: run.error })
    }
  }

  return results
}

/**
 * Gather upstream outputs for a node by following actual graph edges.
 * Maps each incoming edge's targetHandle to the source node's output.
 */
function gatherInputs(
  nodeId: string,
  outputs: Record<string, unknown>,
  graph: Graph
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const edge of graph.edges) {
    if (edge.target === nodeId && outputs[edge.source] !== undefined) {
      // Use the targetHandle as the key, or fallback to source node ID
      const key = (edge as unknown as Record<string, string>).targetHandle ?? edge.source
      if (key in result) {
        result[key] = Array.isArray(result[key])
          ? [...(result[key] as unknown[]), outputs[edge.source]]
          : [result[key], outputs[edge.source]]
      } else {
        result[key] = outputs[edge.source]
      }
    }
  }

  return result
}

/**
 * Decrement in-degree for children of a completed node.
 * If a child's in-degree hits 0, add it to the queue.
 */
function advanceChildren(
  adj: Record<string, string[]>,
  inDegree: Record<string, number>,
  nodeId: string,
  queue: string[]
) {
  for (const child of adj[nodeId]) {
    inDegree[child]--
    if (inDegree[child] === 0) {
      queue.push(child)
    }
  }
}
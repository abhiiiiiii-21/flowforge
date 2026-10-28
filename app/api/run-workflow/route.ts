import { tasks } from "@trigger.dev/sdk/v3"
import { createRun, markRunAsRunning } from "@/lib/db/run.repository"
import { runWorkflowSchema } from "@/lib/validations"
import type { workflowTask } from "@/src/trigger/workflow.task"
import type { Graph } from "@/src/trigger/engine/types"
import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"

type ClientRunScope = "full" | "partial" | "single"
type DbRunScope = "FULL" | "PARTIAL" | "SINGLE"

function toDbScope(scope: ClientRunScope | undefined): DbRunScope {
  if (scope === "single") return "SINGLE"
  if (scope === "partial") return "PARTIAL"
  return "FULL"
}

function collectAncestorIds(graph: Graph, selectedIds: Set<string>): Set<string> {
  const ancestors = new Set<string>()
  const queue = [...selectedIds]

  while (queue.length > 0) {
    const id = queue.shift()!

    for (const edge of graph.edges) {
      if (
        edge.target === id &&
        !selectedIds.has(edge.source) &&
        !ancestors.has(edge.source)
      ) {
        ancestors.add(edge.source)
        queue.push(edge.source)
      }
    }
  }

  return ancestors
}

async function getLatestNodeOutputs(workflowId: string, nodeIds: string[]) {
  const outputs = new Map<string, unknown>()
  if (nodeIds.length === 0) return outputs

  const runs = await prisma.run.findMany({
    where: {
      workflowVersion: { workflowId },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      nodeExecutions: {
        where: {
          nodeId: { in: nodeIds },
          status: "SUCCESS",
        },
        select: {
          nodeId: true,
          output: true,
        },
      },
    },
  })

  for (const run of runs) {
    for (const execution of run.nodeExecutions) {
      if (!outputs.has(execution.nodeId) && execution.output !== null) {
        outputs.set(execution.nodeId, execution.output)
      }
    }
  }

  return outputs
}

async function buildGraphForRun(
  graph: Graph,
  workflowId: string,
  selectedNodeIds: string[] | undefined,
  scope: ClientRunScope | undefined
): Promise<{ graph: Graph; error?: string; missingCachedNodeIds?: string[] }> {
  if (!scope || scope === "full") {
    return { graph }
  }

  if (!selectedNodeIds || selectedNodeIds.length === 0) {
    return { graph, error: "Select at least one node to run a partial workflow" }
  }

  const graphNodeIds = new Set(graph.nodes.map((node) => node.id))
  const selectedIds = new Set(selectedNodeIds)
  const invalidIds = [...selectedIds].filter((id) => !graphNodeIds.has(id))

  if (invalidIds.length > 0) {
    return {
      graph,
      error: `Selected node${invalidIds.length > 1 ? "s" : ""} not found in the saved workflow`,
    }
  }

  const ancestorIds = collectAncestorIds(graph, selectedIds)
  const cachedOutputs = await getLatestNodeOutputs(workflowId, [...ancestorIds])
  const missingCachedNodeIds = [...ancestorIds].filter((id) => !cachedOutputs.has(id))

  if (missingCachedNodeIds.length > 0) {
    return {
      graph,
      error: "Upstream nodes must be run before a partial workflow can use them",
      missingCachedNodeIds,
    }
  }

  const includedIds = new Set([...selectedIds, ...ancestorIds])
  const partialGraph: Graph = {
    nodes: graph.nodes
      .filter((node) => includedIds.has(node.id))
      .map((node) =>
        ancestorIds.has(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                __cachedOutput: cachedOutputs.get(node.id),
              },
            }
          : node
      ),
    edges: graph.edges.filter(
      (edge) => includedIds.has(edge.source) && includedIds.has(edge.target)
    ),
  }

  return { graph: partialGraph }
}

/**
 * POST /api/run-workflow
 *
 * 1. Validates the request payload.
 * 2. Loads the saved workflow version graph.
 * 3. Narrows the graph when the user selected a partial/single run.
 * 4. Creates a Run record and triggers the Trigger.dev orchestrator task.
 * 5. Saves the Trigger.dev run handle ID for realtime subscriptions.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    const body = await request.json()

    const parsed = runWorkflowSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const workflowVersionId = parsed.data.workflowVersionId

    const version = await prisma.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      select: {
        id: true,
        workflowId: true,
        graph: true,
        workflow: { select: { userId: true } },
      },
    })

    if (!version) {
      return Response.json({ error: "WorkflowVersion not found" }, { status: 404 })
    }

    if (version.workflow.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    const scope = parsed.data.scope ?? "full"
    const graphForRun = await buildGraphForRun(
      version.graph as unknown as Graph,
      version.workflowId,
      parsed.data.selectedNodeIds,
      scope
    )

    if (graphForRun.error) {
      return Response.json(
        {
          error: graphForRun.error,
          missingCachedNodeIds: graphForRun.missingCachedNodeIds,
        },
        { status: 400 }
      )
    }

    const { runId } = await createRun(
      graphForRun.graph,
      workflowVersionId,
      userId,
      toDbScope(scope)
    )

    const handle = await tasks.trigger<typeof workflowTask>(
      "workflow.run",
      { runId, graph: graphForRun.graph }
    )

    await markRunAsRunning(runId, handle.id)

    return Response.json({
      runId,
      triggerRunId: handle.id,
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[POST /api/run-workflow] Error:", error)
    return Response.json(
      { error: "Failed to start workflow" },
      { status: 500 }
    )
  }
}

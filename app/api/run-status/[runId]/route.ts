import { getRunById } from "@/lib/db/run.repository"
import { getNodeExecutions } from "@/lib/db/node.repository"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"

/**
 * GET /api/run-status/[runId]
 *
 * Returns the current state of a workflow run from the database.
 * This is the "refresh resilience" endpoint — when the user reloads
 * the page, the frontend calls this to rebuild the UI from DB state
 * before reconnecting to the live stream.
 *
 * Response shape:
 * {
 *   run: { id, status, triggerRunId, ... },
 *   executions: [{ nodeId, status, output, error, ... }]
 * }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  try {
    const userId = await getCurrentUserId()
    const run = await getRunById(runId)

    if (!run) {
      return Response.json(
        { error: "Run not found" },
        { status: 404 }
      )
    }

    if (run.userId !== userId) {
      return Response.json(
        { error: "Run not found" },
        { status: 404 }
      )
    }

    const executions = await getNodeExecutions(runId)

    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        triggerRunId: run.triggerRunId,
        createdAt: run.createdAt,
      },
      executions: executions.map(formatNodeExecution),
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[GET /api/run-status] Error:", error)
    return Response.json(
      { error: "Failed to fetch run status" },
      { status: 500 }
    )
  }
}

/* ─── Formatters ───────────────────────────────────── */

function formatNodeExecution(exec: {
  nodeId: string
  status: string
  output: unknown
  error: string | null
  startedAt: Date | null
  finishedAt: Date | null
}) {
  return {
    nodeId: exec.nodeId,
    status: exec.status,
    output: exec.output,
    error: exec.error,
    startedAt: exec.startedAt,
    finishedAt: exec.finishedAt,
  }
}

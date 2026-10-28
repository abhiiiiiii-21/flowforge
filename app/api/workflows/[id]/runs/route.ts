import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"

/**
 * GET /api/workflows/[id]/runs
 * Run history for every version of a workflow.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const userId = await getCurrentUserId()

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true },
    })

    if (!workflow) {
      return Response.json({ error: "Workflow not found" }, { status: 404 })
    }

    const runs = await prisma.run.findMany({
      where: {
        workflowVersion: { workflowId: id },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        scope: true,
        graph: true,
        triggerRunId: true,
        workflowVersionId: true,
        createdAt: true,
        updatedAt: true,
        nodeExecutions: {
          select: {
            nodeId: true,
            status: true,
            input: true,
            output: true,
            error: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
    })

    return Response.json({ runs })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[GET /api/workflows/[id]/runs] Error:", error)
    return Response.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
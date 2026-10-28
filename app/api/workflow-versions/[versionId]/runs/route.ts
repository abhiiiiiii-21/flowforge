import { prisma } from "@/lib/prisma";
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/workflow-versions/[versionId]/runs
 * Run history scoped strictly to workflowVersionId.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  try {
    const userId = await getCurrentUserId();

    const version = await prisma.workflowVersion.findUnique({
      where: { id: versionId },
      select: { id: true, workflow: { select: { userId: true } } },
    });
    if (!version) {
      return Response.json({ error: "WorkflowVersion not found" }, { status: 404 });
    }
    if (version.workflow.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const runs = await prisma.run.findMany({
      where: { workflowVersionId: versionId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        scope: true,
        triggerRunId: true,
        createdAt: true,
        nodeExecutions: {
          select: {
            nodeId: true,
            status: true,
            output: true,
            error: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
    });

    return Response.json({ runs });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse();
    console.error("[GET /api/workflow-versions/[versionId]/runs] Error:", error);
    return Response.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}
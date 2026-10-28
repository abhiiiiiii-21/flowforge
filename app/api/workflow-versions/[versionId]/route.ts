import { prisma } from "@/lib/prisma";
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/workflow-versions/[versionId]
 * Returns graph + metadata for a workflow version.
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
      select: {
        id: true,
        version: true,
        isPublished: true,
        createdAt: true,
        graph: true,
        workflow: {
          select: { id: true, userId: true, name: true, updatedAt: true, createdAt: true },
        },
      },
    });

    if (!version) {
      return Response.json({ error: "WorkflowVersion not found" }, { status: 404 });
    }
    if (version.workflow.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json({ version });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse();
    console.error("[GET /api/workflow-versions/[versionId]] Error:", error);
    return Response.json({ error: "Failed to fetch version" }, { status: 500 });
  }
}
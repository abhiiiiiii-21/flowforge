import { prisma } from "@/lib/prisma";
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth";

/**
 * GET /api/workflows/[id]/versions
 * Returns all versions for a workflow (metadata only).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const userId = await getCurrentUserId();

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!workflow) {
      return Response.json({ error: "Workflow not found" }, { status: 404 });
    }

    const versions = await prisma.workflowVersion.findMany({
      where: { workflowId: id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        isPublished: true,
        createdAt: true,
      },
    });

    return Response.json({ versions });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse();
    console.error("[GET /api/workflows/[id]/versions] Error:", error);
    return Response.json({ error: "Failed to fetch versions" }, { status: 500 });
  }
}
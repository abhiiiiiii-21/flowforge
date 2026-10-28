import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"

/**
 * GET /api/workflows/[id]/export — Export workflow as JSON
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const userId = await getCurrentUserId()
    const { searchParams } = new URL(request.url)
    const versionParam = searchParams.get("version")
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            graph: true,
            isPublished: true,
          },
        },
      },
    })

    if (!workflow) {
      return Response.json({ error: "Workflow not found" }, { status: 404 })
    }

    const selectedVersion =
      versionParam
        ? workflow.versions.find((v) => v.version === Number(versionParam)) ?? null
        : workflow.versions.find((v) => v.isPublished) ?? workflow.versions[0] ?? null

    if (!selectedVersion) {
      return Response.json({ error: "Workflow has no versions" }, { status: 400 })
    }

    const exportData = {
      name: workflow.name,
      graph: selectedVersion.graph,
      version: selectedVersion.version,
      exportedAt: new Date().toISOString(),
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json"`,
      },
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[GET /api/workflows/[id]/export] Error:", error)
    return Response.json({ error: "Failed to export workflow" }, { status: 500 })
  }
}
import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"
import { updateWorkflowSchema } from "@/lib/validations"
import { Prisma } from "@/src/generated/prisma/client"

/**
 * GET /api/workflows/[id] — Load a workflow
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
    const mode = searchParams.get("mode") // latest | published

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
            createdAt: true,
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
        : mode === "latest"
          ? workflow.versions[0] ?? null
          : workflow.versions.find((v) => v.isPublished) ?? workflow.versions[0] ?? null

    const recentRuns = await prisma.run.findMany({
      where: {
        workflowVersion: {
          workflowId: workflow.id,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        scope: true,
        createdAt: true,
        workflowVersionId: true,
        nodeExecutions: {
          select: {
            nodeId: true,
            status: true,
            output: true,
            error: true,
            finishedAt: true,
          },
        },
      },
    })

    // Compute the latest output/state per node by walking runs newest→oldest
    // and keeping the first entry found for each nodeId. This lets the UI
    // restore prior outputs after a refresh straight from the DB.
    const latestByNode: Record<
      string,
      { status: string; output: unknown; error: string | null }
    > = {}
    for (const run of recentRuns) {
      for (const exec of run.nodeExecutions) {
        if (latestByNode[exec.nodeId]) continue
        latestByNode[exec.nodeId] = {
          status: exec.status,
          output: exec.output,
          error: exec.error,
        }
      }
    }

    return Response.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        userId: workflow.userId,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        graph: selectedVersion?.graph ?? null,
      },
      selectedVersion,
      versions: workflow.versions,
      runs: recentRuns,
      latestByNode,
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[GET /api/workflows/[id]] Error:", error)
    return Response.json({ error: "Failed to load workflow" }, { status: 500 })
  }
}

/**
 * PUT /api/workflows/[id] — Update a workflow
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const userId = await getCurrentUserId()
    const body = await request.json()

    const parsed = updateWorkflowSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Ensure ownership
    const existing = await prisma.workflow.findFirst({
      where: { id, userId },
    })
    if (!existing) {
      return Response.json({ error: "Workflow not found" }, { status: 404 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.update({
        where: { id },
        data: {
          ...(parsed.data.name && { name: parsed.data.name }),
        },
      })

      let version:
        | {
            id: string
            version: number
            isPublished: boolean
          }
        | null = null

      if (parsed.data.graph) {
        const latest = await tx.workflowVersion.findFirst({
          where: { workflowId: id },
          orderBy: { version: "desc" },
          select: { version: true },
        })

        version = await tx.workflowVersion.create({
          data: {
            workflowId: id,
            version: (latest?.version ?? 0) + 1,
            graph: parsed.data.graph as unknown as Prisma.InputJsonValue,
            isPublished: true,
          },
          select: { id: true, version: true, isPublished: true },
        })
      }

      return { workflow, version }
    })

    return Response.json({
      id: updated.workflow.id,
      name: updated.workflow.name,
      versionId: updated.version?.id ?? null,
      version: updated.version?.version ?? null,
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[PUT /api/workflows/[id]] Error:", error)
    return Response.json({ error: "Failed to update workflow" }, { status: 500 })
  }
}

/**
 * DELETE /api/workflows/[id] — Delete a workflow
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const userId = await getCurrentUserId()

    const existing = await prisma.workflow.findFirst({
      where: { id, userId },
    })
    if (!existing) {
      return Response.json({ error: "Workflow not found" }, { status: 404 })
    }

    await prisma.workflow.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[DELETE /api/workflows/[id]] Error:", error)
    return Response.json({ error: "Failed to delete workflow" }, { status: 500 })
  }
}
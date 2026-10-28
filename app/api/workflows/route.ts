import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"
import { saveWorkflowSchema } from "@/lib/validations"
import { Prisma } from "@/src/generated/prisma/client"
import { SAMPLE_WORKFLOW_GRAPH } from "@/lib/sampleWorkflow"

/**
 * GET /api/workflows — List all workflows for the current user
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId()

    // Auto-seed a sample workflow for brand-new users (first visit).
    await seedSampleWorkflowIfNeeded(userId)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim() ?? ""
    const sort = searchParams.get("sort") ?? "updatedAt"
    const order = searchParams.get("order") === "asc" ? "asc" : "desc"
    const filter = searchParams.get("filter") ?? "projects"

    const filterByName =
      filter === "apps"
        ? "app"
        : filter === "examples"
          ? "example"
          : filter === "templates"
            ? "template"
            : null

    const workflows = await prisma.workflow.findMany({
      where: {
        userId,
        ...(filterByName
          ? {
              name: {
                contains: filterByName,
                mode: "insensitive",
              },
            }
          : {}),
        ...(search
          ? {
              name: {
                contains: search,
                mode: "insensitive",
              },
            }
          : {}),
      },
      orderBy:
        sort === "name"
          ? { name: order }
          : sort === "createdAt"
            ? { createdAt: order }
            : { updatedAt: order },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            isPublished: true,
            createdAt: true,
          },
        },
      },
    })

    return Response.json({
      workflows: workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        latestVersion: workflow.versions[0] ?? null,
      })),
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[GET /api/workflows] Error:", error)
    return Response.json(
      { error: "Failed to fetch workflows" },
      { status: 500 }
    )
  }
}

/**
 * Seed a "Sample Workflow" if the user has zero workflows.
 * Non-fatal — any error is logged but swallowed.
 */
async function seedSampleWorkflowIfNeeded(userId: string) {
  try {
    const count = await prisma.workflow.count({ where: { userId } })
    if (count > 0) return

    await prisma.$transaction(async (tx) => {
      // Ensure User row exists (may not if webhook hasn't fired yet).
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId },
      })

      const workflow = await tx.workflow.create({
        data: { userId, name: "Sample Workflow" },
      })

      await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          graph: SAMPLE_WORKFLOW_GRAPH as unknown as Prisma.InputJsonValue,
          isPublished: true,
        },
      })
    })

    console.log(`[workflows] seeded sample workflow for user ${userId}`)
  } catch (err) {
    console.error("[workflows] failed to seed sample workflow:", err)
  }
}

/**
 * POST /api/workflows — Save a new workflow
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    const body = await request.json()

    const parsed = saveWorkflowSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid workflow data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const graphJson = parsed.data.graph as unknown as Prisma.InputJsonValue

    const created = await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId },
      })

      const workflow = await tx.workflow.create({
        data: {
          userId,
          name: parsed.data.name?.trim() || "Untitled",
        },
      })

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          graph: graphJson,
          isPublished: true,
        },
      })

      return { workflow, version }
    })

    return Response.json(
      {
        id: created.workflow.id,
        name: created.workflow.name,
        versionId: created.version.id,
        version: created.version.version,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[POST /api/workflows] Error:", error)
    return Response.json(
      { error: "Failed to save workflow" },
      { status: 500 }
    )
  }
}
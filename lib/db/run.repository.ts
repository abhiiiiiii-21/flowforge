import { prisma } from "@/lib/prisma"
import { Prisma } from "@/src/generated/prisma/client"
import type { Graph } from "@/src/trigger/engine/types"

/* ─── Create ───────────────────────────────────────── */

/**
 * Create a new workflow run record.
 * Returns the `runId` that becomes the primary handle for this execution.
 */
export async function createRun(
  graph: Graph,
  workflowVersionId: string,
  userId?: string | null,
  scope: "FULL" | "PARTIAL" | "SINGLE" = "FULL"
) {
  const run = await prisma.run.create({
    data: {
      ...(userId ? { userId } : {}),
      status: "PENDING",
      scope,
      graph: graph as unknown as Prisma.InputJsonValue,
      workflowVersionId,
    },
  })

  return { runId: run.id }
}

/* ─── Update Status ────────────────────────────────── */

export async function markRunAsRunning(runId: string, triggerRunId: string) {
  return prisma.run.update({
    where: { id: runId },
    data: {
      status: "RUNNING",
      triggerRunId,
    },
  })
}

export async function markRunAsCompleted(runId: string) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: "COMPLETED" },
  })
}

export async function markRunAsFailed(runId: string) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: "FAILED" },
  })
}

/* ─── Query ────────────────────────────────────────── */

export async function getRunById(runId: string) {
  return prisma.run.findUnique({
    where: { id: runId },
    include: { nodeExecutions: true },
  })
}

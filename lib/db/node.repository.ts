import { prisma } from "@/lib/prisma"
import { Prisma } from "@/src/generated/prisma/client"

/* ─── Lifecycle ────────────────────────────────────── */

/**
 * Mark a node as RUNNING.
 * Uses upsert so it's safe to call even if the row doesn't exist yet.
 */
export async function markNodeAsRunning(
  runId: string,
  nodeId: string,
  input?: unknown
) {
  const inputJson =
    input === undefined
      ? undefined
      : (input as unknown as Prisma.InputJsonValue)

  return prisma.nodeExecution.upsert({
    where: { runId_nodeId: { runId, nodeId } },
    update: {
      status: "RUNNING",
      startedAt: new Date(),
      ...(inputJson !== undefined ? { input: inputJson } : {}),
    },
    create: {
      runId,
      nodeId,
      status: "RUNNING",
      startedAt: new Date(),
      ...(inputJson !== undefined ? { input: inputJson } : {}),
    },
  })
}

/**
 * Mark a node as SUCCESS and persist its output.
 */
export async function markNodeAsCompleted(
  runId: string,
  nodeId: string,
  output: unknown
) {
  return prisma.nodeExecution.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: {
      status: "SUCCESS",
      output: output as unknown as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  })
}

/**
 * Mark a node as FAILED and persist the error message.
 */
export async function markNodeAsFailed(
  runId: string,
  nodeId: string,
  error: string
) {
  return prisma.nodeExecution.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: {
      status: "FAILED",
      error,
      finishedAt: new Date(),
    },
  })
}

/* ─── Query ────────────────────────────────────────── */

export async function getNodeExecutions(runId: string) {
  return prisma.nodeExecution.findMany({
    where: { runId },
    orderBy: { startedAt: "asc" },
  })
}
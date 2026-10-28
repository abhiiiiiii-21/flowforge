import { auth } from "@trigger.dev/sdk/v3"
import { prisma } from "@/lib/prisma"
import { getCurrentUserId, UnauthenticatedError, unauthorizedResponse } from "@/lib/auth"

/**
 * POST /api/auth/realtime
 *
 * Generates a scoped public access token for the frontend to
 * subscribe to a specific Trigger.dev run via realtime hooks.
 *
 * The frontend sends { triggerRunId } and receives back a
 * short-lived publicAccessToken scoped to only that run.
 *
 * This keeps the TRIGGER_SECRET_KEY on the server while giving
 * the frontend minimal read access.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    const { triggerRunId } = await request.json()

    if (!triggerRunId || typeof triggerRunId !== "string") {
      return Response.json(
        { error: "triggerRunId is required" },
        { status: 400 }
      )
    }

    const run = await prisma.run.findFirst({
      where: { triggerRunId, userId },
      select: { id: true },
    })

    if (!run) {
      return Response.json({ error: "Run not found" }, { status: 404 })
    }

    const publicAccessToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [triggerRunId],
        },
      },
      expirationTime: "1h",
    })

    return Response.json({ publicAccessToken })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorizedResponse()
    console.error("[POST /api/auth/realtime] Error:", error)
    return Response.json(
      { error: "Failed to generate access token" },
      { status: 500 }
    )
  }
}

import { headers } from "next/headers";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/src/generated/prisma/client";

// Force Node.js runtime — Prisma + svix don't work on the edge runtime.
export const runtime = "nodejs";
// Webhooks are POSTs; never cache.
export const dynamic = "force-dynamic";

/**
 * Clerk webhook receiver.
 *
 * Configure in Clerk dashboard with:
 *   URL: https://<public-domain>/api/webhooks/clerk
 *   Events: user.created, user.updated, user.deleted
 *   Set CLERK_WEBHOOK_SECRET to the "Signing Secret" from that endpoint page.
 *
 * Local dev: Clerk cannot reach http://localhost — run `ngrok http 3000`
 * and put the ngrok URL in the dashboard.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk webhook] CLERK_WEBHOOK_SECRET not set");
    return Response.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const hdrs = await headers();
  const svixId = hdrs.get("svix-id");
  const svixTimestamp = hdrs.get("svix-timestamp");
  const svixSignature = hdrs.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[clerk webhook] missing svix headers", {
      hasId: !!svixId,
      hasTs: !!svixTimestamp,
      hasSig: !!svixSignature,
    });
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  // svix.verify needs the raw body string — do NOT JSON.parse first.
  const payload = await req.text();
  const wh = new Webhook(secret);

  type ClerkEvent = {
    type: string;
    data: {
      id: string;
      email_addresses?: Array<{ email_address: string }>;
      first_name?: string | null;
      last_name?: string | null;
    };
  };

  let evt: ClerkEvent;
  try {
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.error("[clerk webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[clerk webhook] received ${evt.type} for user ${evt.data.id}`);

  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const userId = evt.data.id;
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId },
      });
      console.log(`[clerk webhook] upserted user ${userId}`);

      // Seed a sample workflow for brand-new users.
      if (evt.type === "user.created") {
        try {
          await seedSampleWorkflow(userId);
          console.log(`[clerk webhook] seeded sample workflow for ${userId}`);
        } catch (seedErr) {
          // Non-fatal — log but don't fail the webhook.
          console.error("[clerk webhook] failed to seed sample workflow:", seedErr);
        }
      }
    } else if (evt.type === "user.deleted") {
      const userId = evt.data.id;
      await prisma.user
        .delete({ where: { id: userId } })
        .catch((err) => {
          // P2025 = record not found; fine — webhook may fire for users we
          // never inserted (e.g. created in Clerk before this app started).
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as { code: string }).code === "P2025"
          ) {
            console.log(`[clerk webhook] delete skipped (no row) for ${userId}`);
            return;
          }
          throw err;
        });
    } else {
      console.log(`[clerk webhook] ignoring event type ${evt.type}`);
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[clerk webhook] db error:", err);
    return Response.json(
      { error: "DB error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Optional: GET so you can hit the URL in a browser to confirm the route exists.
export async function GET() {
  return Response.json({
    ok: true,
    hint: "POST signed events here. Configure in Clerk dashboard.",
  });
}

/* ─── Sample Workflow Seeder ─────────────────────────────── */

import { SAMPLE_WORKFLOW_GRAPH } from "@/lib/sampleWorkflow";

async function seedSampleWorkflow(userId: string) {
  await prisma.$transaction(async (tx) => {
    const workflow = await tx.workflow.create({
      data: {
        userId,
        name: "Sample Workflow",
      },
    });

    await tx.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        graph: SAMPLE_WORKFLOW_GRAPH as unknown as Prisma.InputJsonValue,
        isPublished: true,
      },
    });
  });
}
/**
 * Auth utility.
 *
 * - When Clerk is configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set), this
 *   throws `UNAUTHENTICATED` if there is no signed-in user. Callers should
 *   catch and return a 401. We deliberately do NOT silently fall back to
 *   `anonymous` — that masked sign-in failures and ended up writing real
 *   user data under the `anonymous` row.
 * - When Clerk is NOT configured (local/dev with no keys), returns
 *   `anonymous` so the API still works in unauthenticated dev mode.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "UnauthenticatedError";
  }
}

export async function getCurrentUserId(): Promise<string> {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) throw new UnauthenticatedError();
    return userId;
  }
  return "anonymous";
}

/**
 * Wrap a route handler body so `UnauthenticatedError` becomes a 401 response
 * instead of a 500. Other errors propagate.
 */
export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
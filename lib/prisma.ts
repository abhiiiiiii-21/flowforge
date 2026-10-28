import { PrismaClient } from "@/src/generated/prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { neonConfig } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

/**
 * Singleton Prisma client with Neon serverless adapter.
 *
 * Prisma v7 removed built-in drivers — we must provide an adapter.
 * `PrismaNeon` takes a `PoolConfig` object (not a Pool instance).
 *
 * In development, Next.js hot-reloads modules which would create
 * a new PrismaClient on every reload. We cache the instance on
 * `globalThis` to prevent exhausting database connections.
 */

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
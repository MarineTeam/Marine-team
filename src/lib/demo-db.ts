import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  demoPrisma: PrismaClient | undefined;
};

/**
 * A separate database connection just for /demo content, so seeded demo
 * data can never end up mixed into the real church's production database.
 * Falls back to the main DATABASE_URL if DEMO_DATABASE_URL isn't set, so
 * local development without a second database still works.
 */
export const demoPrisma =
  globalForPrisma.demoPrisma ??
  new PrismaClient({
    datasourceUrl: process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.demoPrisma = demoPrisma;
}

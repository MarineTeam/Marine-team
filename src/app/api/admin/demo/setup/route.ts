import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { DEMO_SCHEMA_STATEMENTS } from "@/lib/demo-schema";
import { seedDemoContent } from "@/lib/demo-seed";

/**
 * One-time setup for the /demo section: creates the schema and seeds demo
 * content in DEMO_DATABASE_URL. Safe to call more than once — table/index
 * creation tolerates "already exists" and seeding checks for existing
 * content first. Runs from the deployed app (not local tooling) because
 * this needs a real network path to the demo database.
 */
export async function POST() {
  try {
    await ensureAdmin();

    const demoUrl = process.env.DEMO_DATABASE_URL;
    if (!demoUrl) {
      return NextResponse.json({ error: "DEMO_DATABASE_URL is not set" }, { status: 400 });
    }

    const client = new PrismaClient({ datasourceUrl: demoUrl });
    const applied: string[] = [];
    const skipped: string[] = [];

    try {
      for (const statement of DEMO_SCHEMA_STATEMENTS) {
        const label = statement.split("\n")[0].slice(0, 60);
        try {
          await client.$executeRawUnsafe(statement);
          applied.push(label);
        } catch (error) {
          if (error instanceof Error && /already exists/i.test(error.message)) {
            skipped.push(label);
          } else {
            throw error;
          }
        }
      }

      const seedResult = await seedDemoContent(client);
      return NextResponse.json({ applied, skipped, ...seedResult });
    } finally {
      await client.$disconnect();
    }
  } catch (error) {
    return errorResponse(error);
  }
}

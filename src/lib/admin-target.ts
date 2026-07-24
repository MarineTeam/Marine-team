import type { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { demoPrisma } from "@/lib/demo-db";

/**
 * Admin API routes are shared between the real CMS and the /demo section's
 * management pages. `?target=demo` on the request picks which database a
 * request operates on; anything else (including no param) uses the real
 * one. Never used for /api/admin/users — access/auth is never per-target.
 */
export function getTargetDb(request: NextRequest): PrismaClient {
  const target = request.nextUrl.searchParams.get("target");
  return target === "demo" ? demoPrisma : prisma;
}

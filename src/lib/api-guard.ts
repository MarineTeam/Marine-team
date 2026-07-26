import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/current-user";
import type { User } from "@prisma/client";

/** Resolves the current admin user, or throws a NextResponse the caller should return. */
export async function ensureAdmin(): Promise<User> {
  try {
    return await requireAdmin();
  } catch {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

/**
 * Maps a thrown value to a client-safe response.
 *
 * Only errors describing the *caller's own request* carry detail back:
 * validation failures and the standard Prisma record errors. Anything else is
 * logged server-side and answered generically, because those messages quote
 * upstream internals verbatim — Bunny API response bodies, Prisma query text,
 * and env var names like "Missing BUNNY_STREAM_LIBRARY_ID env var" — none of
 * which should reach a browser.
 */
export function errorResponse(error: unknown): NextResponse {
  // Guards (ensureStaff, ensureCategoryAccess, ...) throw a ready response.
  if (error instanceof NextResponse) return error;

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: z.treeifyError(error) },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // https://www.prisma.io/docs/orm/reference/error-reference
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That already exists" }, { status: 409 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: "Related record not found" }, { status: 400 });
    }
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

import { NextResponse } from "next/server";
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

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof NextResponse) return error;
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}

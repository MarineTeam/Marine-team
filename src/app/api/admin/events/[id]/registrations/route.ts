import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * Who is coming.
 *
 * Also the printable version: whoever is on the door wants a list on paper,
 * and `?format=csv` is what a spreadsheet and a mail-merge both take.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;

    const event = await prisma.event.findUnique({ where: { id }, select: { title: true, slug: true } });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId: id },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, email: true } } },
    });

    if (new URL(request.url).searchParams.get("format") !== "csv") {
      return NextResponse.json({ registrations });
    }

    const csv = toCsv(
      registrations.map((registration) => ({
        Name: registration.name,
        Email: registration.email,
        Phone: registration.phone ?? "",
        Guests: registration.guests,
        Places: 1 + registration.guests,
        Status: registration.status,
        // Whether they are a member matters for a follow-up letter, and is
        // the one thing the list can say that the sign-up form didn't ask.
        Member: registration.userId ? "yes" : "no",
        Note: registration.note ?? "",
        "Signed up": registration.createdAt.toISOString(),
      })),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

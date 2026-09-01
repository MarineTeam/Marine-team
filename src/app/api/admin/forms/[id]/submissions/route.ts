import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { columnsFor, submissionRow } from "@/lib/forms";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * What people sent in.
 *
 * The columns are every question the form has *ever* asked — live ones first,
 * retired ones after — because a submission from March answered questions that
 * are no longer on the form, and quietly dropping those columns loses what
 * somebody actually said.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;

    const form = await prisma.form.findUnique({
      where: { id },
      include: { fields: { orderBy: { position: "asc" } } },
    });
    if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const submissions = await prisma.formSubmission.findMany({
      where: { formId: id },
      orderBy: { createdAt: "desc" },
      include: {
        answers: { select: { fieldId: true, value: true } },
        user: { select: { email: true } },
      },
    });

    const columns = columnsFor(form.fields);

    if (new URL(request.url).searchParams.get("format") !== "csv") {
      return NextResponse.json({ columns, submissions });
    }

    const csv = toCsv(
      submissions.map((submission) => ({
        Sent: submission.createdAt.toISOString(),
        Account: submission.user?.email ?? "",
        ...submissionRow(columns, submission.answers),
      })),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${form.slug}-responses.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

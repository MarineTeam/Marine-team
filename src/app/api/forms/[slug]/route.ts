import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { validateSubmission } from "@/lib/forms";
import { getPublicForm } from "@/lib/forms-query";
import { isPluginEnabled } from "@/lib/plugins";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";

/**
 * Sending a form in.
 *
 * Open to visitors, which is the whole point of a connect card — so it is rate
 * limited per form, and every answer is checked against the questions as they
 * stand rather than against what the browser was told to enforce.
 */

const submitSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

/** Twenty a minute on one form is a script, not a congregation. */
const MAX_PER_MINUTE = 20;

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("forms"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const form = await getPublicForm(slug);
    if (!form || !form.published) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = await getCurrentUser();
    if (form.memberOnly && !user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const limited = await rateLimitResponse(
      () => prisma.formSubmission.count({ where: { formId: form.id, createdAt: { gte: windowStart(60) } } }),
      MAX_PER_MINUTE,
    );
    if (limited) return limited;

    if (!form.multiple && user) {
      const already = await prisma.formSubmission.count({ where: { formId: form.id, userId: user.id } });
      if (already > 0) {
        return NextResponse.json({ error: "You've already sent this one in." }, { status: 409 });
      }
    }

    const body = submitSchema.parse(await request.json());
    const { values, errors } = validateSubmission(form.fields, body.answers);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Some answers need another look.", errors }, { status: 400 });
    }

    const submission = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        userId: user?.id ?? null,
        answers: {
          create: Object.entries(values).map(([fieldId, value]) => ({ fieldId, value })),
        },
      },
    });

    await notifyForm(form, values);
    return NextResponse.json({ id: submission.id, confirmation: form.confirmation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Tells whoever the form names.
 *
 * The addresses live on the form rather than in an env var because different
 * forms reach different people, and the person who knows which is the one
 * editing the form. A failure here is logged and swallowed: the submission is
 * already saved, and losing it because an SMTP server was down would be the
 * worse outcome by far.
 */
async function notifyForm(
  form: { title: string; slug: string; notifyEmails: string | null; fields: { id: string; label: string }[] },
  values: Record<string, string>,
): Promise<void> {
  const addresses = (form.notifyEmails ?? "")
    .split(/[,\s]+/)
    .map((address) => address.trim())
    .filter(Boolean);
  if (addresses.length === 0) return;

  const summary = form.fields
    .filter((field) => values[field.id])
    .map((field) => `${field.label}: ${values[field.id].split("\n").join(", ")}`)
    .join("\n");

  await Promise.all(
    addresses.map((address) =>
      sendEmail(address, `New response: ${form.title}`, summary, `/admin/forms`).catch((error) => {
        console.error("Couldn't send a form notification:", error);
      }),
    ),
  );
}

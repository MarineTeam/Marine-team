import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { addIsoDays, isIsoDate, todayIso } from "@/lib/dates";
import {
  approveExpense,
  createCategory,
  listCategories,
  moneyView,
  payExpense,
  recordExpense,
  rejectExpense,
  reopenExpense,
  requireMoney,
  updateCategory,
} from "@/lib/expenses-query";
import { allBalances } from "@/lib/funds-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Money going out.
 *
 * Behind `manage_giving` — the same grant as the income side, because a
 * treasurer's job is both halves and splitting the capability would mean
 * somebody who can see what came in and not what went out, which is a worse
 * half-answer than either alone.
 *
 * Every approval goes through the query layer with the **signed-in** user.
 * Nothing in a request body ever names an approver, which is what makes the
 * self-approval refusal mean anything at all.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().refine(isIsoDate, "Not a date");
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("category"),
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    annualBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  }),
  z.object({
    action: z.literal("edit-category"),
    categoryId: z.string().min(1).max(60),
    name: z.string().trim().min(1).max(80).optional(),
    annualBudget: z.number().int().positive().max(1_000_000_000).nullish(),
    active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("expense"),
    categoryId: z.string().min(1).max(60),
    amount: z.number().int().positive().max(1_000_000_000),
    payee: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(500),
    incurredOn: isoDate,
    claimantId: z.string().min(1).max(60).nullish(),
    receiptRef: z.string().trim().max(120).nullish(),
    fundId: z.string().min(1).max(60).nullish(),
  }),
  z.object({ action: z.literal("approve"), expenseId: z.string().min(1).max(60) }),
  z.object({
    action: z.literal("reject"),
    expenseId: z.string().min(1).max(60),
    reason: z.string().trim().max(500),
  }),
  z.object({ action: z.literal("reopen"), expenseId: z.string().min(1).max(60) }),
  z.object({
    action: z.literal("pay"),
    expenseId: z.string().min(1).max(60),
    paidOn: isoDate,
    method: z.string().trim().max(60).nullish(),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("expenses"))) return notFound();
    await requireMoney();

    const params = request.nextUrl.searchParams;
    const today = todayIso();
    const from = params.get("from");
    const to = params.get("to");

    return NextResponse.json(
      {
        view: await moneyView(
          from && isIsoDate(from) ? from : addIsoDays(today, -365),
          to && isIsoDate(to) ? to : today,
        ),
        categories: await listCategories(),
        // The open funds with what is left in each, so a treasurer choosing
        // one can see whether it can carry the cost before they choose it
        // rather than after the approval is refused.
        funds: await allBalances(false),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("expenses"))) return notFound();
    const user = await requireMoney();
    const input = body.parse(await request.json());

    switch (input.action) {
      case "category": {
        const row = await createCategory(input);
        await logAudit(user.email, "create", "expense-category", row.id, input.name);
        return NextResponse.json({ category: row }, { status: 201 });
      }
      case "edit-category": {
        const row = await updateCategory(input.categoryId, input);
        await logAudit(user.email, "edit", "expense-category", row.id, "");
        return NextResponse.json({ ok: true });
      }
      case "expense": {
        const row = await recordExpense(input, user);
        await logAudit(user.email, "record", "expense", row.id, `${input.amount}p ${input.payee}`);
        return NextResponse.json({ expense: row }, { status: 201 });
      }
      case "approve": {
        // The approver is the session, never the body.
        await approveExpense(input.expenseId, user);
        await logAudit(user.email, "approve", "expense", input.expenseId, "");
        return NextResponse.json({ ok: true });
      }
      case "reject": {
        await rejectExpense(input.expenseId, input.reason, user);
        await logAudit(user.email, "reject", "expense", input.expenseId, input.reason);
        return NextResponse.json({ ok: true });
      }
      case "reopen": {
        await reopenExpense(input.expenseId);
        await logAudit(user.email, "reopen", "expense", input.expenseId, "");
        return NextResponse.json({ ok: true });
      }
      case "pay": {
        await payExpense(input.expenseId, input, user);
        await logAudit(user.email, "pay", "expense", input.expenseId, input.paidOn);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}

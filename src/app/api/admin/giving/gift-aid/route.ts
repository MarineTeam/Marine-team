import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { addIsoDays, isIsoDate, todayIso } from "@/lib/dates";
import { DEFAULT_REVIEW_DAYS } from "@/lib/gift-aid";
import {
  claims,
  createClaim,
  declarations,
  deleteClaim,
  giftAidView,
  recordDeclaration,
  requireGivingAccess,
  unclaimedWorth,
  updateClaim,
  withdrawDeclaration,
} from "@/lib/gift-aid-query";
import { isPluginEnabled } from "@/lib/plugins";
import { logRead } from "@/lib/read-audit-query";

/**
 * Gift Aid: declarations, the reconciliation, and claims.
 *
 * Behind `manage_giving`, the same grant as the rest of giving — a declaration
 * carries a home address and says something about somebody's tax affairs, which
 * is not a thing to widen the readership of.
 *
 * Read-audited for the same reason. A declaration list is a list of named people
 * with their addresses, which is squarely the kind of screen the read log exists
 * for.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().refine(isIsoDate, "Not a date");

const declarationSchema = z.object({
  action: z.literal("declare"),
  personId: z.string().min(1).max(60),
  madeOn: isoDate,
  coversPast: z.boolean(),
  title: z.string().trim().max(20).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  houseNumber: z.string().trim().min(1).max(120),
  postcode: z.string().trim().min(1).max(20),
  how: z.enum(["PAPER", "ONLINE", "VERBAL"]),
});

const withdrawSchema = z.object({
  action: z.literal("withdraw"),
  declarationId: z.string().min(1).max(60),
  on: isoDate,
  note: z.string().trim().max(500).optional(),
});

const claimSchema = z.object({
  action: z.literal("claim"),
  from: isoDate,
  to: isoDate,
});

const updateSchema = z.object({
  action: z.literal("update-claim"),
  claimId: z.string().min(1).max(60),
  submittedOn: isoDate.nullish(),
  settledOn: isoDate.nullish(),
  reference: z.string().trim().max(60).nullish(),
});

const body = z.discriminatedUnion("action", [
  declarationSchema,
  withdrawSchema,
  claimSchema,
  updateSchema,
]);

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requireGivingAccess();
    await logRead({ kind: "gift_aid_declarations", actorEmail: user.email });

    const params = request.nextUrl.searchParams;
    const today = todayIso();
    const from = params.get("from");
    const to = params.get("to");

    return NextResponse.json(
      {
        view: await giftAidView(
          from && isIsoDate(from) ? from : addIsoDays(today, -DEFAULT_REVIEW_DAYS),
          to && isIsoDate(to) ? to : today,
        ),
        declarations: await declarations(),
        claims: await claims(),
        worth: await unclaimedWorth(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requireGivingAccess();
    const input = body.parse(await request.json());

    switch (input.action) {
      case "declare": {
        const row = await recordDeclaration(input, user);
        await logAudit(user.email, "create", "gift-aid-declaration", row.id, `${input.lastName}, ${input.madeOn}`);
        return NextResponse.json({ declaration: row }, { status: 201 });
      }
      case "withdraw": {
        const row = await withdrawDeclaration(input.declarationId, input.on, input.note);
        await logAudit(user.email, "withdraw", "gift-aid-declaration", row.id, input.on);
        return NextResponse.json({ ok: true });
      }
      case "claim": {
        const claim = await createClaim(input.from, input.to, user);
        await logAudit(
          user.email,
          "create",
          "gift-aid-claim",
          claim.id,
          `${claim.giftCount} gifts, ${claim.claimTotal}p`,
        );
        return NextResponse.json({ claim }, { status: 201 });
      }
      case "update-claim": {
        const row = await updateClaim(input.claimId, input);
        await logAudit(user.email, "edit", "gift-aid-claim", row.id, input.reference ?? "");
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requireGivingAccess();
    const id = request.nextUrl.searchParams.get("claimId");
    if (!id) return NextResponse.json({ error: "Which claim?" }, { status: 400 });

    await deleteClaim(id);
    await logAudit(user.email, "delete", "gift-aid-claim", id, "never submitted");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

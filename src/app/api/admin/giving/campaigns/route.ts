import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isIsoDate } from "@/lib/dates";
import { isPluginEnabled } from "@/lib/plugins";
import {
  campaignView,
  cancelPledge,
  createCampaign,
  listCampaigns,
  recordPledge,
  requirePledgeAccess,
  updateCampaign,
} from "@/lib/pledges-query";
import { logRead } from "@/lib/read-audit-query";

/**
 * Campaigns and the pledges against them.
 *
 * Behind `manage_giving`, like the rest of giving: a pledge list says who has
 * promised what, which is as sensitive as the gift records themselves and more
 * socially charged — people compare.
 *
 * Read-audited for the same reason. The public totals have their own route and
 * carry no promise and no name.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().refine(isIsoDate, "Not a date");
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

const campaignSchema = z.object({
  action: z.literal("campaign"),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/, "Letters, numbers and hyphens"),
  description: z.string().trim().max(2000).optional(),
  target: z.number().int().positive().max(1_000_000_000).nullable(),
  fundId: z.string().min(1).max(60),
  startsOn: isoDate,
  endsOn: isoDate.nullable(),
  publicTotals: z.boolean(),
});

const editSchema = z.object({
  action: z.literal("edit-campaign"),
  campaignId: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullish(),
  target: z.number().int().positive().max(1_000_000_000).nullish(),
  endsOn: isoDate.nullish(),
  publicTotals: z.boolean().optional(),
  closed: z.boolean().optional(),
});

const pledgeSchema = z.object({
  action: z.literal("pledge"),
  campaignId: z.string().min(1).max(60),
  householdId: z.string().min(1).max(60).nullable(),
  personId: z.string().min(1).max(60).nullable(),
  amount: z.number().int().positive().max(1_000_000_000),
  schedule: z.enum(["ONE_OFF", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
  startsOn: isoDate,
  endsOn: isoDate.nullable(),
  note: z.string().trim().max(500).optional(),
  nameMayBeShown: z.boolean(),
});

const cancelSchema = z.object({
  action: z.literal("cancel-pledge"),
  pledgeId: z.string().min(1).max(60),
});

const body = z.discriminatedUnion("action", [campaignSchema, editSchema, pledgeSchema, cancelSchema]);

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requirePledgeAccess();

    const slug = request.nextUrl.searchParams.get("slug");
    if (slug) {
      await logRead({ kind: "pledges", actorEmail: user.email, subjectId: slug });
      return NextResponse.json(await campaignView(slug), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(
      { campaigns: await listCampaigns() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requirePledgeAccess();
    const input = body.parse(await request.json());

    switch (input.action) {
      case "campaign": {
        const row = await createCampaign({ ...input, target: input.target }, user);
        await logAudit(user.email, "create", "campaign", row.id, input.name);
        return NextResponse.json({ campaign: row }, { status: 201 });
      }
      case "edit-campaign": {
        const row = await updateCampaign(input.campaignId, input);
        await logAudit(user.email, "edit", "campaign", row.id, input.closed ? "closed" : "");
        return NextResponse.json({ ok: true });
      }
      case "pledge": {
        const row = await recordPledge(input, user);
        // The amount is in the audit line because a pledge is a figure the
        // church will later be asked to justify having recorded.
        await logAudit(user.email, "record", "pledge", row.id, `${input.amount}p ${input.schedule}`);
        return NextResponse.json({ pledge: row }, { status: 201 });
      }
      case "cancel-pledge": {
        await cancelPledge(input.pledgeId);
        await logAudit(user.email, "cancel", "pledge", input.pledgeId, "");
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}

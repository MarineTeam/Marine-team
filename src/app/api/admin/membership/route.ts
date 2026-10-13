import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isIsoDate, todayIso } from "@/lib/dates";
import { requirePeopleAccess } from "@/lib/households-query";
import {
  historyFor,
  noteFor,
  notOnRoll,
  recordChange,
  roll,
  rollRevision,
} from "@/lib/membership-query";
import { isPluginEnabled } from "@/lib/plugins";
import { logRead } from "@/lib/read-audit-query";

/**
 * The membership roll.
 *
 * Behind `manage_people` — the same grant as the household records, because a
 * roll is the same sort of list and kept by the same person.
 *
 * The one thing this route will not do in bulk is hand out the note on an
 * event. It is asked for one event at a time, by id, and recorded in the read
 * log when it is — so the reason somebody came off the roll is never on a
 * screen that was opened to look at something else. Same shape as the
 * safeguarding withdrawal reason, for the same reason.
 *
 * There is no PATCH and no DELETE. A correction is a further event: that is
 * what keeps last year's roll reproducible, and an editable log would not.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().refine(isIsoDate, "Not a date");

const CHANGES = [
  "BAPTISM",
  "PROFESSION",
  "TRANSFER_IN",
  "RESTORED",
  "DEATH",
  "TRANSFER_OUT",
  "REQUEST",
  "LAPSED",
] as const;

const changeSchema = z.object({
  personId: z.string().min(1).max(60),
  change: z.enum(CHANGES),
  on: isoDate,
  congregation: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("membership"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requirePeopleAccess();
    const params = request.nextUrl.searchParams;

    // One event's note, asked for on purpose.
    const noteOn = params.get("noteOn");
    if (noteOn) {
      await logAudit(user.email, "view", "membership-note", noteOn, "roll note");
      await logRead({ kind: "membership_note", actorEmail: user.email, subjectId: noteOn });
      return NextResponse.json({ note: await noteFor(noteOn) });
    }

    const person = params.get("person");
    if (person) return NextResponse.json(await historyFor(person));

    const asked = params.get("at");
    const at = asked && isIsoDate(asked) ? asked : todayIso();
    const from = params.get("from");
    const to = params.get("to");

    const [entries, candidates] = await Promise.all([roll(at), notOnRoll()]);
    return NextResponse.json(
      {
        at,
        roll: entries,
        candidates,
        revision:
          from && to && isIsoDate(from) && isIsoDate(to) ? await rollRevision(from, to) : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("membership"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requirePeopleAccess();
    const input = changeSchema.parse(await request.json());
    const row = await recordChange(input, user);
    // The note is not in the audit line: that log has a wider readership than
    // this roll does. Same split as a withdrawn clearance.
    await logAudit(user.email, "record", "membership", row.id, `${input.change} on ${input.on}`);
    return NextResponse.json({ event: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

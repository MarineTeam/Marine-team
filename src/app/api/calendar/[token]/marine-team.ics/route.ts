import { personalCalendarEntries, userByCalendarToken } from "@/lib/calendar-feed-query";
import { getBranding } from "@/lib/branding";
import { icsCalendar } from "@/lib/ics";

/**
 * One member's own diary — what they are serving at, what they have signed up
 * for, the dates a rota names them on — as a calendar their phone subscribes
 * to.
 *
 * The token in the path is the whole of the authentication, because a calendar
 * application cannot log in. Three consequences, all deliberate:
 *
 *  - It is generated on request rather than for everybody, so a member who
 *    never asks for one has no such URL to leak.
 *  - It is replaced rather than repaired: "reset the link" is the only honest
 *    answer to "this got out", and it stops every subscriber at once.
 *  - Nothing here is cached by a shared cache and nothing is indexed. A CDN
 *    holding one member's rota under a URL is the failure this is guarding
 *    against.
 *
 * Ends in `.ics` because that is what Google Calendar's "from URL" wants to
 * see; the token is the segment before it.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userByCalendarToken(token);
  // The same answer for a wrong token and a revoked one — there is nothing to
  // gain from telling the difference.
  if (!user) return new Response("Not found", { status: 404 });

  const [brand, events] = await Promise.all([getBranding(), personalCalendarEntries(user)]);
  const body = icsCalendar({ name: `${brand.name} — ${user.displayName ?? user.name ?? "My diary"}`, events, refreshHours: 4 });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="my-diary.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

import { publicCalendarEntries } from "@/lib/calendar-feed-query";
import { getBranding } from "@/lib/branding";
import { icsCalendar } from "@/lib/ics";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Everything that's on, as a calendar somebody can subscribe to once and never
 * think about again — which is the difference between a diary people use and a
 * page people mean to check.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isPluginEnabled("events"))) return new Response("Not found", { status: 404 });

  const [brand, events] = await Promise.all([getBranding(), publicCalendarEntries()]);
  const body = icsCalendar({ name: `${brand.name} — What's On`, events, refreshHours: 6 });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="whats-on.ics"',
      // Short, because a new event should reach a subscriber the same day.
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}

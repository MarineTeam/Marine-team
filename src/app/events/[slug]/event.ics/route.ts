import { eventEntry } from "@/lib/calendar-feed";
import { getEventBySlug } from "@/lib/events";
import { icsCalendar } from "@/lib/ics";
import { isPluginEnabled } from "@/lib/plugins";

/** One event, for the "add to my calendar" button on its page. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isPluginEnabled("events"))) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  // memberOnly is refused rather than gated on a session: this URL is opened
  // by a calendar application, not a browser, so there is nobody to check —
  // and a members-only event has to stay out of anything anonymous.
  if (!event || !event.published || event.memberOnly) {
    return new Response("Not found", { status: 404 });
  }

  const body = icsCalendar({ name: event.title, events: [eventEntry(event)] });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { EventEditor, type EditableEvent } from "@/components/event-editor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** One event: what it is, whether it takes sign-ups, and who has signed up. */
export default async function AdminEventPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();

  const editable: EditableEvent = {
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    opensAt: event.opensAt?.toISOString() ?? null,
    closesAt: event.closesAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/events" className="text-accent hover:underline">
          ← Events
        </Link>
      </p>
      <h1 className="text-lg font-semibold text-ink">{event.title}</h1>
      <EventEditor event={editable} />
    </div>
  );
}

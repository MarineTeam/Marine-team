import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { assignmentRole, getPlanAssignments, personName } from "@/lib/rota";
import { PrintButton } from "@/components/print-button";
import { SaveServiceButton } from "@/components/save-service-button";
import { isPluginEnabled } from "@/lib/plugins";
import {
  firstPresentableItem,
  planItemPresentable,
  presentHref,
  getServicePlan,
  planItemHref,
  planItemNumber,
  planItemReadable,
  planItemTitle,
  planItemTitles,
} from "@/lib/services";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const plan = await getServicePlan(id);
  return plan ? { title: plan.title, description: "The hymns for this service, in order." } : {};
}

/**
 * One service's running order.
 *
 * Every row is a tap straight to the hymn — its lyrics if it is its own file,
 * or its book's contents carrying the number if it is one of many in a
 * hymnal, where the number is resolved to a page against that book's own
 * bookmarks. A hymn that has since been unpublished, or one this visitor
 * isn't signed in for, still shows in the order: it is being sung either way,
 * and a gap would be a worse answer than a row that doesn't open.
 */
export default async function ServicePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pluginOn, plan, user] = await Promise.all([
    isPluginEnabled("service-plans"),
    getServicePlan(id),
    getCurrentUser(),
  ]);
  if (!pluginOn || !plan) notFound();

  const [downloadsOn, titles, assignments] = await Promise.all([
    // Keeping the order on the device is the same permission as keeping a
    // book or a video on it. A plan belongs to no section, so this is the
    // site-wide setting rather than a scoped one.
    isPluginEnabled("downloads"),
    // A book's own title names the book, not the hymn — see planItemTitles.
    planItemTitles(plan.items),
    getPlanAssignments(plan.id),
  ]);

  // Accepted only. Somebody who hasn't answered yet, or said they can't, is
  // not serving — and printing "asked" beside a name on a public page turns a
  // private conversation into a notice board.
  const serving = assignments
    .filter((assignment) => assignment.status === "ACCEPTED")
    .map((assignment) => ({
      id: assignment.id,
      name: personName(assignment.user),
      role: assignmentRole(assignment),
    }));

  const isLoggedIn = Boolean(user);
  const presentable = firstPresentableItem(plan);
  const day = plan.serviceDate
    ? plan.serviceDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/services" className="no-print text-sm text-sec hover:underline">
        ← Services
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{plan.title}</h1>
        {day && <p className="mt-1 text-sm text-sec">{day}</p>}
        {plan.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-sec">{plan.notes}</p>}
        {/* Starts at the first hymn with words and carries on through the
            order, so whoever is driving the screen never comes back here. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {presentable && (
            <Link
              href={presentHref(presentable, plan.id)}
              className="no-print rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
            >
              Present this service
            </Link>
          )}
          {/* For whoever would rather hand out the numbers than a phone.
              The sheet is this page without the app around it — see the
              print rules in globals.css. */}
          {plan.items.length > 0 && <PrintButton label="Print the order" />}
        </div>
        {/* Below the row of actions rather than in it: it has its own state
            to report — saved, changed since, removed — and a button that
            grows a sentence underneath doesn't belong in a row of buttons. */}
        {plan.items.length > 0 && downloadsOn && (
          <div className="mt-3">
            <SaveServiceButton
              planId={plan.id}
              hasBooks={plan.items.some((item) => item.hymnNumber !== null)}
            />
          </div>
        )}
      </div>

      {/* Who is serving, for everyone who opens the plan — the people are as
          much a part of a service as the hymns. Only those who have said yes:
          an outstanding ask is a conversation between the rota builder and
          one person, not an announcement. */}
      {serving.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Serving</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sec">
            {serving.map((person) => (
              <li key={person.id}>
                <span className="text-ink">{person.name}</span> — {person.role}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No hymns listed for this service yet.
        </p>
      ) : (
        <ol className="print-plain divide-y divide-sep rounded-lg border border-sep">
          {plan.items.map((item) => {
            const href = planItemHref(item);
            const number = planItemNumber(item);
            const readable = planItemReadable(item, isLoggedIn);
            const row = (
              <>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ter">
                  {number ?? ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {planItemTitle(item, titles)}
                  </span>
                  {item.note && <span className="block text-xs text-sec">{item.note}</span>}
                </span>
                {/* Why a row doesn't open is a fact about the app, not about
                    the service, so it stays off the printed sheet. */}
                {!readable && (
                  <span className="no-print shrink-0 text-xs text-ter">
                    {item.file.memberOnly && !isLoggedIn ? "Members only" : "Unavailable"}
                  </span>
                )}
              </>
            );
            return (
              <li key={item.id} className="flex items-center">
                {href && readable ? (
                  <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 hover:bg-hover">
                    {row}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-ter">{row}</div>
                )}
                {/* Starting mid-service is normal — a hymn gets sung out of
                    order, or somebody takes over the screen halfway — so each
                    hymn with words offers its own way onto the projector,
                    not only the first one. */}
                {readable && planItemPresentable(item) && (
                  <Link
                    href={presentHref(item, plan.id)}
                    className="no-print mr-3 shrink-0 rounded border border-sep px-2 py-1 text-xs text-sec hover:bg-hover"
                  >
                    Present
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

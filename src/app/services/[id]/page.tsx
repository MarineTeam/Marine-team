import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { getServicePlan, planItemHref, planItemNumber, planItemReadable } from "@/lib/services";

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

  const isLoggedIn = Boolean(user);
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
      <Link href="/services" className="text-sm text-sec hover:underline">
        ← Services
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{plan.title}</h1>
        {day && <p className="mt-1 text-sm text-sec">{day}</p>}
        {plan.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-sec">{plan.notes}</p>}
      </div>

      {plan.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No hymns listed for this service yet.
        </p>
      ) : (
        <ol className="divide-y divide-sep rounded-lg border border-sep">
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
                  <span className="block truncate text-sm font-medium">{item.file.title}</span>
                  {item.note && <span className="block text-xs text-sec">{item.note}</span>}
                </span>
                {!readable && (
                  <span className="shrink-0 text-xs text-ter">
                    {item.file.memberOnly && !isLoggedIn ? "Members only" : "Unavailable"}
                  </span>
                )}
              </>
            );
            return (
              <li key={item.id}>
                {href && readable ? (
                  <Link href={href} className="flex items-center gap-3 px-3 py-3 hover:bg-hover">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-3 text-ter">{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

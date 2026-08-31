import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isPluginEnabled } from "@/lib/plugins";
import { getPublishedServicePlans } from "@/lib/services";

export const metadata: Metadata = {
  title: "Services",
  description: "The hymns for each service, in order.",
};

/** Formats a service's day the way it would be said out loud. */
function serviceDay(date: Date | null): string {
  if (!date) return "Date to be confirmed";
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Published service plans, soonest first. This is the page somebody opens on
 * the way in, so it stays a list of days and hymn counts — the order itself
 * is one tap away.
 */
export default async function ServicesPage() {
  if (!(await isPluginEnabled("service-plans"))) notFound();
  const plans = await getPublishedServicePlans();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Services</h1>
        <p className="mt-1 text-sm text-sec">The hymns for each service, in the order they&apos;ll be sung.</p>
      </div>

      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          Nothing published yet.
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link href={`/services/${plan.id}`} className="block px-4 py-3 hover:bg-hover">
                <span className="block text-sm font-medium">{plan.title}</span>
                <span className="block text-xs text-sec">
                  {serviceDay(plan.serviceDate)} ·{" "}
                  {plan.items.length === 1 ? "1 hymn" : `${plan.items.length} hymns`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

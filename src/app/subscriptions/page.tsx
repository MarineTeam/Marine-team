import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getSubscriptions } from "@/lib/content";
import { SeriesTile } from "@/components/series-tile";
import { SubscriptionMuteToggle } from "@/components/subscription-mute-toggle";

export default async function SubscriptionsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your subscriptions.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Log in
        </a>
      </div>
    );
  }

  const { seriesSubs, categorySubs } = await getSubscriptions(user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Subscriptions</h1>

      {seriesSubs.length === 0 && categorySubs.length === 0 && (
        <p className="text-sec">
          Not following anything yet — look for the Subscribe button on a series or category page.
        </p>
      )}

      {categorySubs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Categories</h2>
          <div className="space-y-3">
            {categorySubs.map((s) =>
              s.category ? (
                <div key={s.id} className="flex items-center gap-2">
                  <Link
                    href={`/categories/${s.category.slug}`}
                    className="flex-1 block rounded-xl border border-sep bg-panel p-3 transition-colors hover:bg-hover"
                  >
                    <span className="font-medium">{s.category.name}</span>
                  </Link>
                  <SubscriptionMuteToggle type="category" id={s.category.id} initialMuted={s.muted} />
                </div>
              ) : null,
            )}
          </div>
        </section>
      )}

      {seriesSubs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Series</h2>
          <div className="space-y-3">
            {seriesSubs.map((s) =>
              s.series ? (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <SeriesTile series={s.series} />
                  </div>
                  <SubscriptionMuteToggle type="series" id={s.series.id} initialMuted={s.muted} />
                </div>
              ) : null,
            )}
          </div>
        </section>
      )}
    </div>
  );
}

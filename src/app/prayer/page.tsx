import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrayerWall } from "@/components/prayer-wall";
import { getCurrentUser } from "@/lib/current-user";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prayer",
  // People write things here they would not want a search engine to keep.
  robots: { index: false, follow: false },
};

export default async function PrayerPage() {
  if (!(await isPluginEnabled("prayer"))) notFound();
  const [user, { t }] = await Promise.all([getCurrentUser(), currentMessages()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.prayer.title}</h1>
        <p className="mt-1 text-sm text-sec">{t.prayer.subtitle}</p>
      </div>
      <PrayerWall signedIn={Boolean(user)} t={t.prayer} />
    </div>
  );
}

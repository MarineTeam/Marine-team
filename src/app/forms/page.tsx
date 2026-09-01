import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listPublishedForms } from "@/lib/forms-query";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forms" };

/** Everything there is to fill in. Usually one card and a couple of sign-ups. */
export default async function FormsPage() {
  if (!(await isPluginEnabled("forms"))) notFound();
  const [user, { t }] = await Promise.all([getCurrentUser(), currentMessages()]);
  const forms = (await listPublishedForms()).filter((form) => !form.memberOnly || user);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t.forms.title}</h1>

      {forms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.forms.nothingToFill}
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {forms.map((form) => (
            <li key={form.id}>
              <Link href={`/forms/${form.slug}`} className="block px-4 py-3 hover:bg-hover">
                <span className="block text-sm font-medium text-ink">{form.title}</span>
                {form.description && (
                  <span className="block text-xs text-sec">{form.description}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

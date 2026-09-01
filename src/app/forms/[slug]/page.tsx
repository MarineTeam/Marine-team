import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormFiller } from "@/components/form-filler";
import { getCurrentUser } from "@/lib/current-user";
import { getPublicForm } from "@/lib/forms-query";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const form = await getPublicForm(slug);
  if (!form?.published) return { title: "Form" };
  return {
    title: form.title,
    description: form.description?.slice(0, 200) ?? undefined,
    ...(form.memberOnly ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function FormPage(props: { params: Promise<{ slug: string }> }) {
  if (!(await isPluginEnabled("forms"))) notFound();
  const { slug } = await props.params;
  const form = await getPublicForm(slug);
  if (!form || !form.published) notFound();

  // Not a 403: a members-only form is indistinguishable from one that isn't
  // there, so its title doesn't leak either.
  const [user, { t }] = await Promise.all([getCurrentUser(), currentMessages()]);
  if (form.memberOnly && !user) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{form.title}</h1>
        {form.description && (
          <p className="mt-2 text-sm whitespace-pre-wrap text-sec">{form.description}</p>
        )}
      </div>
      <FormFiller
        slug={form.slug}
        fields={form.fields}
        confirmation={form.confirmation}
        t={t.forms}
      />
    </div>
  );
}

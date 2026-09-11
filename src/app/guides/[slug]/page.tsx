import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getGuide, guideViewerFor } from "@/lib/guides-query";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const guide = await getGuide(slug, await guideViewerFor(await getCurrentUser()));
  return { title: guide?.title ?? "Discussion guide" };
}

const LABEL = { QUESTION: "", SCRIPTURE: "Read", NOTE: "" } as const;

/**
 * One guide.
 *
 * The leader notes are rendered from their own field, which only exists when
 * this reader may have them — see lib/guides.ts. The items loop below cannot
 * print one however it is written, because the items it is given never contain
 * one.
 */
export default async function GuidePage(props: { params: Promise<{ slug: string }> }) {
  if (!(await isPluginEnabled("groups"))) notFound();
  const { slug } = await props.params;
  const guide = await getGuide(slug, await guideViewerFor(await getCurrentUser()));
  if (!guide) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <p className="text-sm">
        <Link href="/guides" className="text-accent hover:underline">
          ← Discussion guides
        </Link>
      </p>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{guide.title}</h1>
        {guide.description && <p className="mt-1 text-sm text-sec">{guide.description}</p>}
      </div>

      <ol className="space-y-4">
        {guide.items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-sep p-4">
            {item.kind === "QUESTION" ? (
              <p className="text-sm font-medium text-ink">
                <span className="mr-2 text-ter">{index + 1}.</span>
                {item.body}
              </p>
            ) : (
              <p className="text-sm text-ink">
                {LABEL[item.kind] && (
                  <span className="mr-2 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
                    {LABEL[item.kind]}
                  </span>
                )}
                {item.body}
              </p>
            )}
            {item.reference && <p className="mt-1 text-xs text-sec">{item.reference}</p>}
          </li>
        ))}
      </ol>

      {guide.leaderNotes && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-amber-800 uppercase dark:text-amber-300">
            For whoever is leading
          </h2>
          <ul className="mt-2 space-y-2">
            {guide.leaderNotes.map((note) => (
              <li key={note.id} className="text-sm text-ink">
                {note.body}
                {note.reference && <span className="block text-xs text-sec">{note.reference}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

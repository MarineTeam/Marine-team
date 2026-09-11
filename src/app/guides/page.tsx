import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { guideViewerFor, listGuides } from "@/lib/guides-query";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discussion guides" };

/** What a group can work through, newest first. */
export default async function GuidesPage() {
  if (!(await isPluginEnabled("groups"))) notFound();
  const viewer = await guideViewerFor(await getCurrentUser());
  const guides = await listGuides(viewer);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Discussion guides</h1>
        <p className="mt-1 text-sm text-sec">Questions to work through together, after a talk or on their own.</p>
      </div>

      {guides.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          Nothing here yet.
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link href={`/guides/${guide.slug}`} className="block px-4 py-3 hover:bg-hover">
                <span className="block text-sm font-medium text-ink">
                  {guide.title}
                  {!guide.published && <span className="text-sec"> · draft</span>}
                </span>
                {guide.description && <span className="block text-xs text-sec">{guide.description}</span>}
                <span className="mt-0.5 block text-xs text-ter">
                  {guide.describes}
                  {guide.follows && ` · follows ${guide.follows.title}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

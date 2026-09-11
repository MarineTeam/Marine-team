import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { directoryFor } from "@/lib/directory-query";
import { isPluginEnabled } from "@/lib/plugins";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Member directory",
  // Never indexed. It is a list of people, behind a login, and a search engine
  // that reached it would be the one failure nobody could undo.
  robots: { index: false, follow: false },
};

/**
 * The people who chose to be findable.
 *
 * Signed-in members only, and a redirect rather than a 404 — somebody who
 * followed a link from the nav and had been signed out should land on the login
 * page, not on a dead end.
 */
export default async function DirectoryPage(props: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isPluginEnabled("profiles"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/directory");

  const { q } = await props.searchParams;
  const members = await directoryFor(q ?? "");

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Member directory</h1>
        <p className="mt-1 text-sm text-sec">
          Everybody who chose to be listed. You decide whether you appear, and what of yours is shown, in{" "}
          <a href="/profile/settings" className="text-accent hover:underline">
            your settings
          </a>
          .
        </p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name"
          aria-label="Search the directory by name"
          className="w-full rounded-md border border-sep px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-sep px-3 py-2 text-sm hover:bg-hover">
          Search
        </button>
      </form>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {q ? "Nobody by that name." : "Nobody has joined the directory yet."}
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {members.map((member) => (
            <li key={member.id} className="px-4 py-3">
              <p className="text-sm font-medium text-ink">{member.name}</p>
              {member.note && <p className="text-xs text-sec">{member.note}</p>}
              {/* Rendered only from the fields that are there. A member who
                  published neither has nothing under their name. */}
              <p className="mt-0.5 text-xs text-ter">
                {member.email && (
                  <a href={`mailto:${member.email}`} className="text-accent hover:underline">
                    {member.email}
                  </a>
                )}
                {member.email && member.phone && " · "}
                {member.phone && (
                  <a href={`tel:${member.phone}`} className="text-accent hover:underline">
                    {member.phone}
                  </a>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { PeopleManager } from "@/components/people-manager";

/** The names that appear on the schedules, and merging duplicates of them. */
export default async function AdminPeoplePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/people");
  if (!(await hasCapability(user, "manage_files"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/schedules" className="text-sm text-zinc-500 hover:underline">
          ← Schedules
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">People</h1>
        <p className="mt-1 text-sm text-sec">
          Everyone who appears on a schedule. These are names, not accounts — most people on a rota
          never log in — and they are created automatically as they turn up in a spreadsheet or on
          an event.
        </p>
      </div>
      <PeopleManager />
    </div>
  );
}

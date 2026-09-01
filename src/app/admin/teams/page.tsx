import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { TeamManager } from "@/components/team-manager";

/** The groups that serve at a service, and who is on each — what a rota is built from. */
export default async function AdminTeamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/teams");
  if (!(await hasCapability(user, "manage_files"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to teams.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/services" className="text-sm text-zinc-500 hover:underline">
          ← Services
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">Teams</h1>
        <p className="mt-1 text-sm text-sec">
          Who can be asked to serve, grouped the way your church thinks of them. Building a
          service&apos;s rota picks from these lists — see a plan in{" "}
          <Link href="/admin/services" className="text-accent hover:underline">
            Services
          </Link>
          .
        </p>
      </div>
      <TeamManager />
    </div>
  );
}

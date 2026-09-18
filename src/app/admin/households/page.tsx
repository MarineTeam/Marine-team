import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { HouseholdsManager } from "@/components/households-manager";

/**
 * The families, and what is coming up for them.
 *
 * Its own capability rather than `manage_users`: that grant is about accounts
 * and who may sign in, and most of the people on this screen have no account
 * — the children certainly don't, and often the grandparents don't either.
 */
export const dynamic = "force-dynamic";

export default async function AdminHouseholdsPage() {
  if (!(await isPluginEnabled("households"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/households");
  if (!(await hasCapability(user, "manage_people"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Households</h1>
        <p className="mt-1 text-sm text-sec">
          Who lives with whom. Check-in reads this to decide who may collect a child, and giving
          statements are addressed by it — so it is worth keeping right even where nothing else
          needs it.
        </p>
      </div>
      <HouseholdsManager />
    </div>
  );
}

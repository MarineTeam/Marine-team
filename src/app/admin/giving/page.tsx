import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { GivingManager } from "@/components/giving-manager";

/**
 * What came in.
 *
 * Money has its own capability rather than riding on managing users or the
 * diary: what a gift record says about somebody is not something the person
 * who books the hall should acquire by being given the hall.
 */
export const dynamic = "force-dynamic";

export default async function AdminGivingPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/giving");
  if (!(await hasCapability(user, "manage_giving"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Gifts</h1>
        <p className="mt-1 text-sm text-sec">
          Online giving arrives here through the payment page&apos;s webhook. No card number ever
          reaches this app — an amount, a fund and a reference do. Cash and cheques are typed in
          below.
        </p>
      </div>
      <GivingManager />
    </div>
  );
}

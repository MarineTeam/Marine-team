import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { GivingFunds } from "@/components/giving-funds";

export const dynamic = "force-dynamic";

export default async function AdminGivingFundsPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/giving/funds");
  if (!(await hasCapability(user, "manage_giving"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/giving" className="text-sm text-accent hover:underline">
          ← Gifts
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">Funds</h1>
        <p className="mt-1 text-sm text-sec">
          A fund is closed rather than deleted: a statement for a past year has to be able to name
          where the money went. Untick <em>on statements</em> for anything that isn&apos;t
          claimable — a leaving collection — and it is left out of the total and reported
          separately rather than quietly dropped.
        </p>
      </div>
      <GivingFunds />
    </div>
  );
}

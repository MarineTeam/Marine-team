import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { GivingStatements } from "@/components/giving-statements";

export const dynamic = "force-dynamic";

export default async function AdminGivingStatementsPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/giving/statements");
  if (!(await hasCapability(user, "manage_giving"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/giving" className="text-sm text-accent hover:underline">
          ← Gifts
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">Statements</h1>
        <p className="mt-1 text-sm text-sec">
          One per household per tax year, addressed by household because that is how a family
          gives. Print this page to send them.
        </p>
      </div>
      <GivingStatements />
    </div>
  );
}

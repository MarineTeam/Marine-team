import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnualAccounts } from "@/components/annual-accounts";
import { requireGivingAccess } from "@/lib/giving-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Receipts and payments.
 *
 * Behind `manage_giving`, like both halves of the money it assembles.
 */
export const dynamic = "force-dynamic";

export default async function AdminAnnualAccountsPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  await requireGivingAccess();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/giving" className="text-sm text-accent hover:underline">
          ← Gifts
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">Receipts and payments</h1>
        <p className="mt-1 text-sm text-sec">
          What came in, what went out and what was left, for one financial year — the statement an
          annual meeting is shown and an independent examiner asks for. Counted on the day the
          money moved, which is not the day a cost was incurred: an invoice approved in December
          and paid in January belongs to December&apos;s budget and to January&apos;s receipts and
          payments.
        </p>
        <p className="mt-1 text-sm text-sec">
          Restricted and unrestricted money are kept in separate columns, because they are
          different money. The financial year is not the tax year — Gift Aid runs on HMRC&apos;s,
          the accounts on whatever year the church adopted.
        </p>
      </div>
      <AnnualAccounts />
    </div>
  );
}

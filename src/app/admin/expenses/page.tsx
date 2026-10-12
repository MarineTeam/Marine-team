import { notFound } from "next/navigation";
import { ExpensesManager } from "@/components/expenses-manager";
import { requireMoney } from "@/lib/expenses-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Money out.
 *
 * Behind `manage_giving`, the same grant as the income side: a treasurer's job
 * is both halves, and a capability that showed only one would be a worse
 * half-answer than either alone.
 */
export const dynamic = "force-dynamic";

export default async function AdminExpensesPage() {
  if (!(await isPluginEnabled("expenses"))) notFound();
  const user = await requireMoney();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Money out</h1>
        <p className="mt-1 text-sm text-sec">
          What the church has spent, against what it set aside. Agreed and paid are kept apart —
          a budget answers what has been committed and a bank statement answers what has left, and
          reporting one as the other either double-spends or understates. Nobody approves their own
          claim, whoever they are.
        </p>
      </div>
      <ExpensesManager meId={user.id} />
    </div>
  );
}

import { ChurchLifeDashboard } from "@/components/church-life-dashboard";
import { requireNumbers } from "@/lib/service-attendance-query";

/**
 * Church life on one page.
 *
 * Deliberately separate from /admin/analytics, which is about content — views,
 * watch-through, which hymns get looked up. This one is about people, and the
 * two answer questions different enough that one page holding both would be
 * read as neither.
 */
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireNumbers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Church life</h1>
        <p className="mt-1 text-sm text-sec">
          The numbers about people rather than about content. Each one opens the thing it counts —
          a figure nobody can check is a figure that gets quoted wrongly in a meeting. You will
          see only the parts you already have access to.
        </p>
      </div>
      <ChurchLifeDashboard />
    </div>
  );
}

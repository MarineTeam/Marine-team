import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { assignmentRole, getMyAssignments } from "@/lib/rota";
import { RotaPanel } from "@/components/rota-panel";

export const metadata = { title: "Your rota" };

/**
 * What this member has been asked to do at a service, and when they're away.
 *
 * In the profile rather than under /services because it is *theirs*: the
 * service page is the running order everyone opens, and this is the handful
 * of asks addressed to one person.
 */
export default async function RotaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/profile/rota");

  if (!(await isPluginEnabled("service-plans"))) {
    return <p className="text-sm text-sec">Service plans are switched off at the moment.</p>;
  }

  const [assignments, blockouts] = await Promise.all([
    getMyAssignments(user.id),
    prisma.serviceBlockout.findMany({ where: { userId: user.id }, orderBy: { startDate: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Your rota</h2>
        <p className="mt-1 text-sm text-sec">
          Say yes or no here and whoever is building the rota sees it straight away.
        </p>
      </div>

      <RotaPanel
        assignments={assignments.map((item) => ({
          id: item.id,
          role: assignmentRole(item),
          status: item.status,
          note: item.note,
          planId: item.plan.id,
          planTitle: item.plan.title,
          // Written out on the server: a date formatted in the browser can
          // differ from the one on the service page beside it.
          day: item.plan.serviceDate
            ? item.plan.serviceDate.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
            : null,
          published: item.plan.published,
        }))}
        blockouts={blockouts.map((item) => ({
          id: item.id,
          startDate: item.startDate.toISOString(),
          endDate: item.endDate.toISOString(),
          reason: item.reason,
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { assignmentRole, getMyAssignments } from "@/lib/rota";
import { askerName, canAskForCover } from "@/lib/cover";
import { openCoverRequests } from "@/lib/cover-query";
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

  const [assignments, blockouts, coverRequests] = await Promise.all([
    getMyAssignments(user.id),
    prisma.serviceBlockout.findMany({ where: { userId: user.id }, orderBy: { startDate: "asc" } }),
    openCoverRequests(user.id),
  ]);

  // Dates are written out on the server throughout: one formatted in the
  // browser can differ from the one on the service page beside it.
  const day = (date: Date | null) =>
    date ? date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;

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
          day: day(item.plan.serviceDate),
          published: item.plan.published,
          coverWanted: item.coverWanted,
          coverNote: item.coverNote,
          // The same rule the API applies, asked here so the button only
          // appears where pressing it would work.
          coverable: canAskForCover(item, user.id) === "ok" || item.coverWanted,
        }))}
        coverRequests={coverRequests.map((request) => ({
          id: request.id,
          role: assignmentRole(request),
          planTitle: request.plan.title,
          day: day(request.plan.serviceDate),
          askedBy: askerName(request.user),
          note: request.coverNote,
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

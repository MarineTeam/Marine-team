import { notFound } from "next/navigation";
import { AttendanceManager } from "@/components/attendance-manager";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * How many people were here.
 *
 * Two capabilities either side of one page: `view_analytics` reads the chart,
 * `manage_events` writes a count. Somebody who can only read sees the chart
 * without the form rather than a form that refuses them.
 */
export const dynamic = "force-dynamic";

export default async function AdminAttendancePage() {
  if (!(await isPluginEnabled("attendance"))) notFound();
  const user = await getCurrentUser();
  if (!user) notFound();

  const [canRead, canCount] = await Promise.all([
    hasCapability(user, "view_analytics"),
    hasCapability(user, "manage_events"),
  ]);
  if (!canRead && !canCount) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Attendance</h1>
        <p className="mt-1 text-sm text-sec">
          A headcount per gathering, written down by whoever was on the door. Not worked out from
          sign-ins — counting the people who tap something misses exactly the people worth
          noticing. It names nobody, so the figure can go to a deacons&apos; meeting or a
          denominational return without anybody having to think about it first.
        </p>
      </div>
      <AttendanceManager canCount={canCount} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { MembershipRoll } from "@/components/membership-roll";
import { requirePeopleAccess } from "@/lib/households-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The membership roll.
 *
 * Behind `manage_people` — the same grant as the household records, because a
 * roll is the same sort of list and is kept by the same person.
 */
export const dynamic = "force-dynamic";

export default async function AdminMembershipPage() {
  if (!(await isPluginEnabled("membership"))) notFound();
  await requirePeopleAccess();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Membership roll</h1>
        <p className="mt-1 text-sm text-sec">
          Who is on the roll, and who was on it on any past date. Kept as a log of joinings and
          leavings rather than a flag against each person, because what a denominational return or
          an auditor asks is not &ldquo;who is a member?&rdquo; but &ldquo;who was on the roll on
          31 December?&rdquo; — and a flag somebody has since overwritten cannot answer that at
          all.
        </p>
        <p className="mt-1 text-sm text-sec">
          Why somebody came off the roll is read one person at a time, not in any listing. A
          transfer is nothing; a removal is not, and a roll is a thing churches pin to a
          noticeboard.
        </p>
      </div>
      <MembershipRoll />
    </div>
  );
}

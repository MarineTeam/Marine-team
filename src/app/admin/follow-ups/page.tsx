import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { FollowUpsManager } from "@/components/follow-ups-manager";

/**
 * The follow-up queue.
 *
 * Not gated at the door on a capability, unlike the rest of /admin: anybody
 * signed in may be holding one, and the API answers each person with what is
 * theirs. The office sees the whole queue.
 */
export const dynamic = "force-dynamic";

export default async function AdminFollowUpsPage() {
  if (!(await isPluginEnabled("follow-ups"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/follow-ups");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Follow-ups</h1>
        <p className="mt-1 text-sm text-sec">
          Connect cards, first sign-ups and people whose group roll says they have stopped coming,
          turned into jobs with a name and a date. Closing one asks what came of it — a queue of
          jobs marked done with nothing written teaches nobody anything.
        </p>
      </div>
      <FollowUpsManager meId={user.id} />
    </div>
  );
}

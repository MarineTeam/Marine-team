import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { CheckinDesk } from "@/components/checkin-desk";

/** One room's desk. */
export const dynamic = "force-dynamic";

export default async function CheckinDeskPage(props: { params: Promise<{ sessionId: string }> }) {
  if (!(await isPluginEnabled("checkin"))) notFound();
  const user = await getCurrentUser();
  const { sessionId } = await props.params;
  if (!user) redirect(`/auth/login?returnTo=/admin/checkin/${sessionId}`);
  if (!(await hasCapability(user, "run_checkin"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/checkin" className="text-accent hover:underline">
          ← Check-in
        </Link>
      </p>
      <CheckinDesk sessionId={sessionId} />
    </div>
  );
}

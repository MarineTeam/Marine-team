import Link from "next/link";
import { redirect } from "next/navigation";
import { TvDevices } from "@/components/tv-devices";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

export const metadata = { title: "Televisions" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/profile/devices");
  if (!(await isPluginEnabled("tv"))) {
    return <p className="text-sm text-sec">Television sign-in is switched off at the moment.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Televisions</h2>
        <p className="mt-1 text-sm text-sec">
          Signed in with a code on the screen. Signing one out here takes effect straight away -
          worth doing for a television you no longer have.{" "}
          <Link href="/link" className="text-accent hover:underline">
            Link another
          </Link>
          .
        </p>
      </div>
      <TvDevices />
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LinkDevice } from "@/components/link-device";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Link a television",
  robots: { index: false, follow: false },
};

/**
 * The short address somebody types on their phone.
 *
 * `/link` rather than `/profile/devices/link`: it goes on a television screen
 * under the code, and every character is one somebody has to read across a
 * room and type on a phone.
 */
export default async function LinkPage() {
  if (!(await isPluginEnabled("tv"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/link");

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Link a television</h1>
        <p className="mt-2 text-sm text-sec">
          Type the code showing on the television. It signs that television in to your account until
          you sign it out again.
        </p>
      </div>
      <LinkDevice />
    </div>
  );
}

import { notFound } from "next/navigation";
import { SafeguardingRegister } from "@/components/safeguarding-register";
import { requireSafeguarding } from "@/lib/clearance-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The safeguarding register.
 *
 * Gated at the door on `manage_people`, the same grant as the household
 * records — and deliberately not the one that keeps the rota. Whoever is
 * scheduling a service gets a yes or a no when they try to put somebody on;
 * they do not get the register behind it.
 */
export const dynamic = "force-dynamic";

export default async function AdminSafeguardingPage() {
  if (!(await isPluginEnabled("safeguarding"))) notFound();
  await requireSafeguarding();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Safeguarding</h1>
        <p className="mt-1 text-sm text-sec">
          That somebody saw a volunteer&apos;s clearance, and until when. A team can be set to
          require one, and then an uncleared person cannot be put on it — refused rather than
          warned about, because a warning on a rota screen is a thing somebody clicks past at half
          past eight on a Sunday morning.
        </p>
      </div>
      <SafeguardingRegister />
    </div>
  );
}

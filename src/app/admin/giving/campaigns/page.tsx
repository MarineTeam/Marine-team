import { CampaignsManager } from "@/components/campaigns-manager";
import { notFound } from "next/navigation";
import { requirePledgeAccess } from "@/lib/pledges-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Campaigns and pledges.
 *
 * Behind `manage_giving`: a pledge list says who promised what, which is as
 * sensitive as the gift records and more socially charged, because people
 * compare.
 */
export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  await requirePledgeAccess();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Campaigns</h1>
        <p className="mt-1 text-sm text-sec">
          What was asked for, what has been promised, and what has actually arrived — three
          different numbers, never added together. A promise is not money, and the money includes
          everybody who gave without ever filling in a card.
        </p>
      </div>
      <CampaignsManager />
    </div>
  );
}

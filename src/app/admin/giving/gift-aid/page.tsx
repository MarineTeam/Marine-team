import { notFound } from "next/navigation";
import { GiftAidManager } from "@/components/gift-aid-manager";
import { requireGivingAccess } from "@/lib/giving-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Gift Aid.
 *
 * Behind `manage_giving`, the same grant as the rest of giving: a declaration
 * carries a home address and says something about somebody's tax affairs, and
 * that is not a readership to widen.
 */
export const dynamic = "force-dynamic";

export default async function AdminGiftAidPage() {
  if (!(await isPluginEnabled("giving"))) notFound();
  await requireGivingAccess();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Gift Aid</h1>
        <p className="mt-1 text-sm text-sec">
          A fund being eligible is not enough — HMRC needs a declaration from the person. This is
          where those live, what they make claimable, and what is being left behind because
          somebody hasn&apos;t signed one or nobody wrote down who gave.
        </p>
      </div>
      <GiftAidManager />
    </div>
  );
}

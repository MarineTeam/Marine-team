import { BottomNav } from "@/components/bottom-nav";
import { isPluginEnabled } from "@/lib/plugins";

export async function BottomNavServer() {
  const watchHistoryOn = await isPluginEnabled("watch-history");
  return <BottomNav watchHistoryOn={watchHistoryOn} />;
}

import { BottomNav } from "@/components/bottom-nav";
import { getShellNav } from "@/lib/nav";

export async function BottomNavServer() {
  const { tabs, tabOptions } = await getShellNav();
  return <BottomNav tabs={tabs} options={tabOptions} />;
}

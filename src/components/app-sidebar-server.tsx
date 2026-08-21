import { AppSidebar } from "@/components/app-sidebar";
import { getShellNav } from "@/lib/nav";

export async function AppSidebarServer() {
  const { branding, sections, account, plugins } = await getShellNav();

  return (
    <AppSidebar
      branding={branding}
      sections={sections}
      account={account}
      showPushToggle={Boolean(account) && plugins.notifications}
    />
  );
}

import { FormsManager } from "@/components/forms-manager";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Connect cards and sign-up forms, built here rather than in code — because
 * the questions change every term and a deploy is the wrong unit of change for
 * "add a box for dietary requirements".
 */
export default async function AdminFormsPage() {
  const pluginOn = await isPluginEnabled("forms");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Forms</h1>
        <p className="mt-1 text-sm text-sec">
          The connect card, a camp application, a request for a visit. Published forms are filled in
          at <code>/forms</code>.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Forms</strong> plugin is switched off, so nobody can fill these in yet.
          </p>
        )}
      </div>
      <FormsManager />
    </div>
  );
}

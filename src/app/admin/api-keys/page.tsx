import { ApiKeysManager } from "@/components/api-keys-manager";

export const metadata = { title: "API keys" };

/**
 * Keys another system uses to read this one.
 *
 * Reachable only with `manage_api_keys`, which is its own capability rather
 * than part of managing users or plugins: a key is standing machine access to
 * the catalogue and, with one scope ticked, to people's names and phone
 * numbers.
 */
export default function AdminApiKeysPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">API keys</h1>
        <p className="mt-1 text-sm text-sec">
          Let another system read this one — a noticeboard, a spreadsheet, a website. Every key is read-only; there is
          no way to change anything through the API. The endpoints are listed at <code>/api/v1</code>.
        </p>
      </div>
      <ApiKeysManager />
    </div>
  );
}

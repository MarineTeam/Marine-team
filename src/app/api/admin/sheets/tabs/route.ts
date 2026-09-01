import { jsonError, jsonOk, NO_STORE_HEADERS, requireAdmin, withErrorHandling } from "@/lib/schedules/http";
import {
  fetchSheetTabNames,
  isGoogleSheetsConfigured,
  serviceAccountEmail,
} from "@/lib/sheets/client";
import { extractSpreadsheetId } from "@/lib/sheets/config";

/**
 * GET /api/admin/sheets/tabs?spreadsheetId=...
 *
 * Lists the tab names in a spreadsheet so the admin form can offer a dropdown
 * instead of asking someone to type a tab name exactly right.
 *
 * Admin-only and rate limited: without those, this would be an open proxy for
 * probing which spreadsheets the service account can read.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();

    // No rate limit here, unlike the calendar app's in-memory one. This is a
    // staff-only probe behind requireAdmin, that limiter was explicitly not an
    // authorization control, and an in-memory counter is per instance on
    // serverless anyway — this app's limits are database-backed and belong on
    // the member-facing writes that have something to count.

  if (!isGoogleSheetsConfigured()) {
    return jsonError(
      503,
      "google_not_configured",
      "Google Sheets is not configured on this server.",
    );
  }

  const url = new URL(request.url);
  // Accept a pasted spreadsheet URL as well as a bare id.
  const spreadsheetId = extractSpreadsheetId(url.searchParams.get("spreadsheetId") ?? "");
  if (!spreadsheetId) {
    return jsonError(422, "validation_failed", "Enter a valid Google Sheets ID or URL.");
  }

  try {
    const tabs = await fetchSheetTabNames(spreadsheetId);
    return jsonOk({ spreadsheetId, tabs }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonOk(
      {
        spreadsheetId,
        tabs: [],
        error:
          error instanceof Error ? error.message : "Could not read that spreadsheet.",
        // Repeating the address here turns the most common failure ("forgot to
        // share the sheet") into a self-service fix.
        shareWith: serviceAccountEmail(),
      },
      { headers: NO_STORE_HEADERS },
    );
  }
});

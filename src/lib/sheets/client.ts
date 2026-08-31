import { JWT } from "google-auth-library";

import { googleCredentials, googleSheetsConfigured } from "@/lib/sheets/credentials";
import { buildA1Range, spreadsheetIdSchema, sheetNameSchema } from "@/lib/sheets/config";
import type { SheetGrid } from "@/lib/sheets/parse";

/**
 * Server-side access to the Google Sheets API.
 *
 * `import "server-only"` makes it a build error for any client component to
 * pull this module -- and therefore the credentials -- into the browser
 * bundle. The browser never talks to Google: it only ever reads events that
 * this app has already fetched, validated and cached.
 *
 * The whole module is optional. When no Google credentials are configured
 * `isGoogleSheetsConfigured()` is false, the admin UI says so, and schedules
 * simply cannot be created with a Google Sheets source.
 */

const SHEETS_API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const REQUEST_TIMEOUT_MS = 15_000;
/** Refresh the cached access token a minute before it actually expires. */
const TOKEN_SAFETY_WINDOW_MS = 60_000;

export function isGoogleSheetsConfigured(): boolean {
  return googleSheetsConfigured();
}

export class GoogleSheetsError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_configured"
      | "unauthorized"
      | "not_found"
      | "sheet_not_found"
      | "rate_limited"
      | "network"
      | "invalid_response"
      | "unknown",
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "GoogleSheetsError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const credentials = googleCredentials();
  if (!credentials) throw new GoogleSheetsError("Google Sheets is not configured", "not_configured");
  if (credentials.kind === "api_key") return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_WINDOW_MS > now) {
    return cachedToken.value;
  }

  const jwt = new JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: SCOPES,
  });

  try {
    const token = await jwt.getAccessToken();
    if (!token?.token) {
      throw new GoogleSheetsError("Google did not return an access token", "unauthorized");
    }
    cachedToken = {
      value: token.token,
      // google-auth-library exposes the expiry on the client after a fetch.
      expiresAt: jwt.credentials.expiry_date ?? now + 3_000_000,
    };
    return cachedToken.value;
  } catch (error) {
    cachedToken = null;
    if (error instanceof GoogleSheetsError) throw error;
    throw new GoogleSheetsError(
      "Could not authenticate with Google. Check the service account email and private key.",
      "unauthorized",
    );
  }
}

/** Reset the token cache. Used by tests and after a credential change. */
export function resetGoogleAuthCache(): void {
  cachedToken = null;
}

export interface FetchSheetOptions {
  spreadsheetId: string;
  sheetName: string;
  range?: string | null;
}

/**
 * Read one sheet as a grid of cells.
 *
 * `valueRenderOption=UNFORMATTED_VALUE` is deliberate: it returns dates as
 * serial numbers rather than locale-formatted strings, which the date parser
 * handles exactly. Formatted strings are still handled for sheets where the
 * cell is plain text.
 */
export async function fetchSheetValues(options: FetchSheetOptions): Promise<SheetGrid> {
  if (!isGoogleSheetsConfigured()) {
    throw new GoogleSheetsError(
      "Google Sheets is not configured on this server. Add a service account to enable it.",
      "not_configured",
    );
  }

  // Re-validate at the network boundary. These values came out of the database
  // and are interpolated into a URL, so they are treated as untrusted.
  const spreadsheetId = spreadsheetIdSchema.safeParse(options.spreadsheetId);
  if (!spreadsheetId.success) {
    throw new GoogleSheetsError("Spreadsheet ID is not valid", "not_found");
  }
  const sheetName = sheetNameSchema.safeParse(options.sheetName);
  if (!sheetName.success) {
    throw new GoogleSheetsError("Sheet name is not valid", "sheet_not_found");
  }

  const a1 = buildA1Range(sheetName.data, options.range ?? null);
  const url = new URL(
    `${SHEETS_API_ROOT}/${encodeURIComponent(spreadsheetId.data)}/values/${encodeURIComponent(a1)}`,
  );
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "SERIAL_NUMBER");

  const headers: Record<string, string> = { Accept: "application/json" };
  const accessToken = await getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    const credentials = googleCredentials();
    if (credentials?.kind === "api_key") url.searchParams.set("key", credentials.apiKey);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "TimeoutError";
    throw new GoogleSheetsError(
      aborted
        ? "Google Sheets did not respond in time"
        : "Could not reach Google Sheets. Check the server's network connection.",
      "network",
      true,
    );
  }

  if (!response.ok) {
    throw translateHttpError(response.status, await safeReadMessage(response), sheetName.data);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("values" in payload || "range" in payload)
  ) {
    throw new GoogleSheetsError("Google Sheets returned an unexpected response", "invalid_response");
  }

  const values = (payload as { values?: unknown }).values;
  if (values === undefined) return []; // An empty sheet omits `values` entirely.
  if (!Array.isArray(values)) {
    throw new GoogleSheetsError("Google Sheets returned an unexpected response", "invalid_response");
  }

  return values.map((row) => (Array.isArray(row) ? (row as unknown[]) : []));
}

async function safeReadMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "object" &&
      (body as { error: { message?: unknown } }).error?.message
    ) {
      return String((body as { error: { message?: unknown } }).error.message);
    }
  } catch {
    // Ignore; the status code alone is enough to build a useful message.
  }
  return "";
}

function translateHttpError(
  status: number,
  detail: string,
  sheetName: string,
): GoogleSheetsError {
  // Google reports "sheet/tab missing" as a 400 with a distinctive message.
  if (status === 400 && /unable to parse range/i.test(detail)) {
    return new GoogleSheetsError(
      `The spreadsheet has no tab named "${sheetName}" (or the range is invalid).`,
      "sheet_not_found",
    );
  }
  switch (status) {
    case 401:
      return new GoogleSheetsError(
        "Google rejected the credentials. Check the service account key.",
        "unauthorized",
      );
    case 403:
      return new GoogleSheetsError(
        "Access denied. Share the spreadsheet with the service account email (Viewer is enough).",
        "unauthorized",
      );
    case 404:
      return new GoogleSheetsError(
        "No spreadsheet found with that ID. Check the ID and that it has not been deleted.",
        "not_found",
      );
    case 429:
      return new GoogleSheetsError(
        "Google Sheets rate limit reached. The next scheduled sync will retry.",
        "rate_limited",
        true,
      );
    default:
      if (status >= 500) {
        return new GoogleSheetsError(
          "Google Sheets is temporarily unavailable. The next scheduled sync will retry.",
          "unknown",
          true,
        );
      }
      return new GoogleSheetsError(
        detail ? `Google Sheets error: ${detail}` : `Google Sheets error (HTTP ${status})`,
        "unknown",
      );
  }
}

/** List the tab names in a spreadsheet, for the admin configuration UI. */
export async function fetchSheetTabNames(spreadsheetId: string): Promise<string[]> {
  if (!isGoogleSheetsConfigured()) {
    throw new GoogleSheetsError("Google Sheets is not configured on this server", "not_configured");
  }
  const parsedId = spreadsheetIdSchema.safeParse(spreadsheetId);
  if (!parsedId.success) throw new GoogleSheetsError("Spreadsheet ID is not valid", "not_found");

  const url = new URL(`${SHEETS_API_ROOT}/${encodeURIComponent(parsedId.data)}`);
  url.searchParams.set("fields", "sheets.properties.title");

  const headers: Record<string, string> = { Accept: "application/json" };
  const accessToken = await getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    const credentials = googleCredentials();
    if (credentials?.kind === "api_key") url.searchParams.set("key", credentials.apiKey);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new GoogleSheetsError("Could not reach Google Sheets", "network", true);
  }

  if (!response.ok) {
    throw translateHttpError(response.status, await safeReadMessage(response), "");
  }

  const payload: unknown = await response.json().catch(() => null);
  const sheets = (payload as { sheets?: Array<{ properties?: { title?: unknown } }> })?.sheets;
  if (!Array.isArray(sheets)) return [];
  return sheets
    .map((sheet) => sheet?.properties?.title)
    .filter((title): title is string => typeof title === "string");
}

/** The address an admin must share their spreadsheet with. */
export function serviceAccountEmail(): string | null {
  const credentials = googleCredentials();
  return credentials?.kind === "service_account" ? credentials.clientEmail : null;
}

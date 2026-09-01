import { z } from "zod";

/**
 * How this app gets into a Google spreadsheet.
 *
 * Three forms, in order of preference, all optional: with none of them set,
 * Google Sheets is simply not offered as a source and the admin interface
 * says so. That is the honest state for a church that manages every rota in
 * the app itself, which is the default.
 *
 * A service account is the right answer — access is granted per spreadsheet
 * by sharing it with that address, so the app can read the one sheet it was
 * given and nothing else. An API key only works for a sheet shared with
 * "anyone with the link", which is a much broader thing to have done.
 *
 * Ported from the calendar app's env module; the rest of that file was its
 * own configuration layer, which this app already has.
 */
export type GoogleCredentials =
  | { kind: "service_account"; clientEmail: string; privateKey: string }
  | { kind: "api_key"; apiKey: string };

/**
 * `.env` files can't hold real newlines, so a private key is conventionally
 * stored with literal `\n` sequences. Both forms are accepted.
 */
function normalizePrivateKey(key: string): string {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export function googleCredentials(): GoogleCredentials | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const shape = z
        .object({ client_email: z.string().min(1), private_key: z.string().min(1) })
        .safeParse(JSON.parse(json));
      if (shape.success) {
        return {
          kind: "service_account",
          clientEmail: shape.data.client_email,
          privateKey: normalizePrivateKey(shape.data.private_key),
        };
      }
    } catch {
      // Not JSON after all; the discrete variables below may still be set.
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (email && key) {
    return { kind: "service_account", clientEmail: email, privateKey: normalizePrivateKey(key) };
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  if (apiKey) return { kind: "api_key", apiKey };

  return null;
}

/** Whether a spreadsheet can be read at all — what the admin UI asks before offering it. */
export function googleSheetsConfigured(): boolean {
  return googleCredentials() !== null;
}

/** The address a spreadsheet has to be shared with, for the admin UI to quote. */
export function serviceAccountEmail(): string | null {
  const credentials = googleCredentials();
  return credentials?.kind === "service_account" ? credentials.clientEmail : null;
}

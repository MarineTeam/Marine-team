import { z } from "zod";

import { isIsoDate } from "@/lib/dates";
import { MAX_NAME_LENGTH } from "@/lib/names";
import {
  a1RangeSchema,
  parserConfigSchema,
  sheetFormatSchema,
  sheetNameSchema,
  spreadsheetIdSchema,
} from "@/lib/sheets/config";

/**
 * Request schemas for every API route.
 *
 * Two things worth calling out:
 *
 *  - Free-text fields are length-bounded and stripped of control characters.
 *    They are *not* HTML-escaped here: React escapes on render, and escaping
 *    at the storage layer would double-encode legitimate apostrophes. The
 *    defence against XSS is that nothing in this app renders user text as
 *    HTML (no `dangerouslySetInnerHTML` anywhere).
 *  - There is no SQL string building anywhere in the app; every query goes
 *    through Prisma's parameterized client, so SQL injection has no surface.
 */

/** Strip C0/C1 control characters, which have no business in a title. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

function cleanText(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "").trim();
}

const shortText = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    .transform(cleanText);

const multilineText = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    // Newlines and tabs are legitimate in notes.
    .transform((value) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "").trim());

/** Cuid-shaped identifier. Rejects anything that is not a plausible id. */
export const idSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier");

export const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isIsoDate(value), "Must be a date in YYYY-MM-DD form");

export const clockTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be a time in HH:mm form");

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

/** Emoji or a short icon token. Bounded so it cannot become a payload. */
export const iconSchema = z.string().trim().min(1).max(8);

export const colorSchema = z.enum([
  "slate",
  "amber",
  "rose",
  "emerald",
  "sky",
  "violet",
  "orange",
  "teal",
]);

export const personNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Must be ${MAX_NAME_LENGTH} characters or fewer`)
  .transform(cleanText)
  .refine((value) => /\p{L}/u.test(value), "A name must contain at least one letter");

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export const googleSheetsConfigSchema = z.object({
  spreadsheetId: spreadsheetIdSchema,
  sheetName: sheetNameSchema,
  range: a1RangeSchema.nullish(),
  format: sheetFormatSchema,
  parserConfig: parserConfigSchema.optional(),
  syncIntervalMinutes: z.number().int().min(0).max(1440).optional(),
});

export const createScheduleSchema = z
  .object({
    name: shortText(80).pipe(z.string().min(1, "Name is required")),
    slug: slugSchema.optional(),
    description: shortText(280).nullish(),
    icon: iconSchema.default("\u{1F4C5}"),
    color: colorSchema.default("slate"),
    enabled: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(9999).optional(),
    sourceType: z.enum(["WEB", "GOOGLE_SHEETS"]).default("WEB"),
    googleSheets: googleSheetsConfigSchema.optional(),
  })
  .refine(
    (value) => value.sourceType !== "GOOGLE_SHEETS" || value.googleSheets !== undefined,
    { message: "Google Sheets settings are required for a Google Sheets schedule", path: ["googleSheets"] },
  );

export const updateScheduleSchema = z
  .object({
    name: shortText(80).pipe(z.string().min(1, "Name is required")).optional(),
    slug: slugSchema.optional(),
    description: shortText(280).nullish(),
    icon: iconSchema.optional(),
    color: colorSchema.optional(),
    enabled: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(9999).optional(),
    sourceType: z.enum(["WEB", "GOOGLE_SHEETS"]).optional(),
    googleSheets: googleSheetsConfigSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const reorderSchedulesSchema = z.object({
  order: z.array(idSchema).min(1).max(200),
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const participantSchema = z.object({
  /** Either an existing person id... */
  personId: idSchema.optional(),
  /** ...or a name, which is resolved (and created if new) server-side. */
  name: personNameSchema.optional(),
  role: shortText(60).nullish(),
});

export const createEventSchema = z
  .object({
    date: isoDateSchema,
    endDate: isoDateSchema.nullish(),
    allDay: z.boolean().default(true),
    startTime: clockTimeSchema.nullish(),
    endTime: clockTimeSchema.nullish(),
    title: shortText(120).nullish(),
    notes: multilineText(2000).nullish(),
    location: shortText(160).nullish(),
    status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).default("CONFIRMED"),
    people: z
      .array(participantSchema.refine((p) => p.personId || p.name, "Each person needs an id or a name"))
      .max(50)
      .default([]),
    recurrenceRule: z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Z0-9=;,:+\-/]*$/i, "Invalid recurrence rule")
      .nullish(),
    recurrenceEndDate: isoDateSchema.nullish(),
  })
  .refine(
    (value) => !value.endDate || value.endDate >= value.date,
    { message: "End date cannot be before the start date", path: ["endDate"] },
  )
  .refine(
    (value) => !value.endTime || !value.startTime || value.endTime >= value.startTime,
    { message: "End time cannot be before the start time", path: ["endTime"] },
  );

export const updateEventSchema = z
  .object({
    scheduleId: idSchema.optional(),
    date: isoDateSchema.optional(),
    endDate: isoDateSchema.nullish(),
    allDay: z.boolean().optional(),
    startTime: clockTimeSchema.nullish(),
    endTime: clockTimeSchema.nullish(),
    title: shortText(120).nullish(),
    notes: multilineText(2000).nullish(),
    location: shortText(160).nullish(),
    status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
    people: z
      .array(participantSchema.refine((p) => p.personId || p.name, "Each person needs an id or a name"))
      .max(50)
      .optional(),
    recurrenceRule: z.string().trim().max(200).nullish(),
    recurrenceEndDate: isoDateSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const createPersonSchema = z.object({
  displayName: personNameSchema,
  active: z.boolean().default(true),
  aliases: z.array(personNameSchema).max(20).default([]),
});

export const updatePersonSchema = z
  .object({
    displayName: personNameSchema.optional(),
    active: z.boolean().optional(),
    aliases: z.array(personNameSchema).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

/** Merge one person into another, for fixing an accidental duplicate. */
export const mergePeopleSchema = z.object({
  sourcePersonId: idSchema,
  targetPersonId: idSchema,
});

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

const csvIds = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split(",")))
  .transform((values) => values.map((entry) => entry.trim()).filter(Boolean))
  .pipe(z.array(idSchema).max(50));

export const eventsQuerySchema = z.object({
  scheduleId: csvIds.optional(),
  personId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

export const snapshotQuerySchema = z.object({
  since: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO timestamp")
    .optional(),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("Must be a URL")
    .max(1000)
    // Push endpoints are always HTTPS; anything else is a forgery attempt.
    .refine((value) => value.startsWith("https://"), "Endpoint must be HTTPS"),
  keys: z.object({
    p256dh: z.string().trim().min(16).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key"),
    auth: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key"),
  }),
});

export const notificationPreferencesSchema = z.object({
  subscription: pushSubscriptionSchema,
  personId: idSchema.nullish(),
  remindDayOf: z.boolean().default(true),
  remindDayBefore: z.boolean().default(false),
  dayOfHour: z.number().int().min(0).max(23).default(7),
  dayBeforeHour: z.number().int().min(0).max(23).default(18),
  timeZone: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/, "Invalid timezone")
    .default("UTC"),
  enabled: z.boolean().default(true),
});

export const unsubscribeSchema = z.object({
  endpoint: z.url().trim().max(1000),
});

// ---------------------------------------------------------------------------
// Admin settings
// ---------------------------------------------------------------------------

export const createAdminUserSchema = z.object({
  email: z.email("Must be an email address").trim().toLowerCase().max(200),
  name: shortText(120).nullish(),
});

export const appSettingsSchema = z.object({
  organizationName: shortText(80).optional(),
  welcomeMessage: shortText(200).optional(),
  autoSyncEnabled: z.boolean().optional(),
});

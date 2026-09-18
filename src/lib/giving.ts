import { createHmac, timingSafeEqual } from "node:crypto";
import type { GiftSource, GiftStatus } from "@prisma/client";
import { toIsoDate, type IsoDate } from "@/lib/dates";

/**
 * Giving — the rules, with no database and no payment processor near them.
 *
 * One decision shapes the whole feature and is worth stating first: **no card
 * number, expiry, name-on-card or token is stored, and none ever reaches this
 * app.** Payment happens on the processor's own hosted page. What comes back
 * is an amount, a currency, a fund and an opaque reference. A church database
 * is not a place to keep a card, and the cheapest way to be sure of that is to
 * never be given one.
 *
 * The second decision is arithmetic. **Money is an integer of minor units** —
 * pence, cents — everywhere, from the webhook to the statement. A total that
 * has been through a binary fraction is a total that disagrees with the bank
 * by a penny in December, and no one can ever say which penny.
 */

/** Minor units as a number of major ones, for display only — never for adding up. */
export function formatMoney(minorUnits: number, currency = "GBP", locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorUnits / 100);
}

/**
 * Minor units from something somebody typed: "12.34" → 1234.
 *
 * The guard here is the pattern, not the arithmetic: it is what refuses
 * "1.234" and "1e3" before either could be rounded into something plausible.
 * Splitting on the point rather than multiplying by 100 is belt and braces —
 * a mutation test showed `Math.round(Number(text) * 100)` gives the same
 * answer for every two-decimal string in a realistic range. Where the integers
 * genuinely earn their keep is *addition*, which is why nothing downstream
 * ever leaves them.
 */
export function parseMoney(input: string): number | null {
  const text = input.trim().replace(/[£$€,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [major, minor = ""] = text.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export type GiftRow = {
  id: string;
  amount: number;
  currency: string;
  fundId: string;
  status: GiftStatus;
  source: GiftSource;
  givenAt: Date;
  householdId: string | null;
  giverId: string | null;
};

export type FundRow = { id: string; name: string; taxDeductible: boolean };

/**
 * Gifts that count towards a total.
 *
 * A refund is kept rather than deleted — the accounts have to show that money
 * arrived and went back — and excluded from every total, because a refunded
 * gift on a statement is a statement somebody may file with a tax return.
 */
export function counted(gifts: readonly GiftRow[]): GiftRow[] {
  return gifts.filter((gift) => gift.status === "SETTLED");
}

export function total(gifts: readonly GiftRow[]): number {
  return counted(gifts).reduce((sum, gift) => sum + gift.amount, 0);
}

export type FundTotal = { fundId: string; fundName: string; amount: number; gifts: number };

/** What came in, by fund, biggest first. */
export function byFund(gifts: readonly GiftRow[], funds: readonly FundRow[]): FundTotal[] {
  const names = new Map(funds.map((fund) => [fund.id, fund.name]));
  const sums = new Map<string, { amount: number; gifts: number }>();

  for (const gift of counted(gifts)) {
    const running = sums.get(gift.fundId) ?? { amount: 0, gifts: 0 };
    sums.set(gift.fundId, { amount: running.amount + gift.amount, gifts: running.gifts + 1 });
  }

  return [...sums.entries()]
    .map(([fundId, sum]) => ({ fundId, fundName: names.get(fundId) ?? "Unknown fund", ...sum }))
    .sort((a, b) => b.amount - a.amount || a.fundName.localeCompare(b.fundName));
}

/**
 * The tax year a date falls in, named by the year it starts.
 *
 * The start is configurable because it is different everywhere: 6 April in the
 * United Kingdom, 1 January in most of the rest. Defaulting to one and
 * hard-coding it is how a statement ends up covering the wrong nine months.
 */
export function taxYearOf(date: Date, startMonth = 4, startDay = 6): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const before = month < startMonth || (month === startMonth && day < startDay);
  return before ? year - 1 : year;
}

/** The half-open range [from, to) covering one tax year. */
export function taxYearRange(year: number, startMonth = 4, startDay = 6): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, startMonth - 1, startDay)),
    to: new Date(Date.UTC(year + 1, startMonth - 1, startDay)),
  };
}

export type StatementLine = { date: IsoDate; fundName: string; amount: number };

export type Statement = {
  householdId: string;
  householdName: string;
  taxYear: number;
  from: IsoDate;
  to: IsoDate;
  currency: string;
  /** Only gifts to funds that belong on a tax statement. */
  lines: StatementLine[];
  total: number;
  /** Given in the year but not claimable, kept visible so the figure is explicable. */
  excludedTotal: number;
};

/**
 * One household's statement for one tax year.
 *
 * Gifts to funds marked not tax-deductible are excluded from the total and
 * reported separately rather than silently dropped: somebody comparing this to
 * their bank statement needs the difference to be explicable, and "we left
 * some out and didn't say" is how a church loses an argument with a donor.
 */
export function statementFor(input: {
  householdId: string;
  householdName: string;
  taxYear: number;
  gifts: readonly GiftRow[];
  funds: readonly FundRow[];
  startMonth?: number;
  startDay?: number;
}): Statement {
  const { startMonth = 4, startDay = 6 } = input;
  const { from, to } = taxYearRange(input.taxYear, startMonth, startDay);
  const fundsById = new Map(input.funds.map((fund) => [fund.id, fund]));

  const inYear = counted(input.gifts).filter(
    (gift) =>
      gift.householdId === input.householdId && gift.givenAt >= from && gift.givenAt < to,
  );

  const claimable = inYear.filter((gift) => fundsById.get(gift.fundId)?.taxDeductible ?? false);
  const rest = inYear.filter((gift) => !(fundsById.get(gift.fundId)?.taxDeductible ?? false));

  return {
    householdId: input.householdId,
    householdName: input.householdName,
    taxYear: input.taxYear,
    from: toIsoDate(from),
    to: toIsoDate(new Date(to.getTime() - 86_400_000)),
    currency: inYear[0]?.currency ?? "GBP",
    lines: claimable
      .map((gift) => ({
        date: toIsoDate(gift.givenAt),
        fundName: fundsById.get(gift.fundId)?.name ?? "Unknown fund",
        amount: gift.amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    total: claimable.reduce((sum, gift) => sum + gift.amount, 0),
    excludedTotal: rest.reduce((sum, gift) => sum + gift.amount, 0),
  };
}

/**
 * Whether a webhook really came from the processor.
 *
 * The scheme is the one Stripe uses and several others copy: the header
 * carries a timestamp and one or more signatures, each an HMAC-SHA256 of
 * `timestamp.body` under the endpoint's secret. Written out here rather than
 * pulled in as a dependency — it is nine lines, and the alternative is a
 * package that ships a payment SDK into a serverless function to check a
 * hash.
 *
 * The timestamp tolerance is what stops a captured delivery being replayed
 * later; the unique reference on the gift is what stops it being replayed
 * *now*. Both, because either alone leaves a hole.
 */
export function webhookIsAuthentic(input: {
  body: string;
  header: string | null;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const { body, header, secret, now = new Date(), toleranceSeconds = 300 } = input;
  if (!header || !secret) return false;

  const parts = new Map<string, string[]>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (!key || !value) continue;
    const list = parts.get(key.trim()) ?? [];
    list.push(value.trim());
    parts.set(key.trim(), list);
  }

  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return signatures.some((candidate) => {
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

/** What a payment page hands back, reduced to what this app keeps. */
export type IncomingGift = {
  externalId: string;
  amount: number;
  currency: string;
  fundSlug: string | null;
  email: string | null;
  message: string | null;
  givenAt: Date;
};

/**
 * Reads a hosted-checkout event into the handful of fields worth storing.
 *
 * Deliberately narrow: it takes the amount, the currency, the reference, the
 * fund and — at most — an email address, and ignores everything else the
 * processor sends. A parser that keeps whatever it is given is how a card's
 * last four digits end up in a church database without anybody deciding to
 * put them there.
 */
export function readCheckout(event: unknown): IncomingGift | null {
  if (typeof event !== "object" || event === null) return null;
  const outer = event as { type?: unknown; data?: { object?: unknown } };
  if (outer.type !== "checkout.session.completed") return null;

  const session = outer.data?.object;
  if (typeof session !== "object" || session === null) return null;
  const row = session as {
    id?: unknown;
    amount_total?: unknown;
    currency?: unknown;
    created?: unknown;
    customer_details?: { email?: unknown };
    metadata?: { fund?: unknown; message?: unknown };
  };

  if (typeof row.id !== "string" || typeof row.amount_total !== "number") return null;
  if (!Number.isInteger(row.amount_total) || row.amount_total <= 0) return null;

  return {
    externalId: row.id,
    amount: row.amount_total,
    currency: typeof row.currency === "string" ? row.currency.toUpperCase() : "GBP",
    fundSlug: typeof row.metadata?.fund === "string" ? row.metadata.fund : null,
    email: typeof row.customer_details?.email === "string" ? row.customer_details.email : null,
    message: typeof row.metadata?.message === "string" ? row.metadata.message.slice(0, 500) : null,
    givenAt: typeof row.created === "number" ? new Date(row.created * 1000) : new Date(),
  };
}

/** The reference of a refunded payment, or null when this isn't one. */
export function readRefund(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const outer = event as { type?: unknown; data?: { object?: unknown } };
  if (outer.type !== "charge.refunded" && outer.type !== "checkout.session.async_payment_failed") {
    return null;
  }
  const object = outer.data?.object as { id?: unknown; payment_intent?: unknown } | undefined;
  const reference = object?.payment_intent ?? object?.id;
  return typeof reference === "string" ? reference : null;
}

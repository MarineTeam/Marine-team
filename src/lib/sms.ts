/**
 * What a text message costs and what a phone number looks like.
 *
 * Pure, and separate from `sms-send.ts` for the same reason `forms.ts` is
 * separate from `forms-query.ts`: the composer is a client component and shows
 * the segment count as somebody types, so this file ends up in the browser
 * bundle. Nothing that talks to a provider belongs in it.
 */

export class SmsError extends Error {}

/**
 * A phone number as an SMS provider wants it: digits, with a leading +.
 *
 * Deliberately conservative. A number it cannot make sense of is returned as
 * null rather than guessed at, because guessing a country code sends somebody
 * else's phone a message about a church they have never heard of.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    return rest.length >= 8 && rest.length <= 15 ? `+${rest}` : null;
  }

  // A national number only becomes international with a country code to add,
  // and only then. `00` is the other way of writing `+`.
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return rest.length >= 8 && rest.length <= 15 ? `+${rest}` : null;
  }

  const country = (defaultCountry ?? process.env.SMS_DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "");
  if (!country) return null;

  // A leading 0 is a national trunk prefix and is dropped when the country
  // code goes on: 07700 900123 in the UK is +44 7700 900123.
  const national = digits.replace(/^0+/, "");
  if (national.length < 6 || national.length > 14) return null;
  return `+${country}${national}`;
}

/**
 * How many SMS segments a message costs.
 *
 * Shown before sending, because "this is four texts to each of 300 people" is
 * a thing to know beforehand rather than on the bill. A message containing any
 * character outside the GSM 7-bit set is sent as UCS-2, where a single segment
 * holds 70 characters instead of 160 — one curly apostrophe pasted from a word
 * processor genuinely does double the cost.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** These take two 7-bit places each. */
const GSM7_EXTENDED = "^{}\\[~]|€";

export function smsSegments(body: string): { segments: number; unicode: boolean; length: number } {
  let units = 0;
  let unicode = false;

  for (const character of body) {
    if (GSM7.includes(character)) units += 1;
    else if (GSM7_EXTENDED.includes(character)) units += 2;
    else {
      unicode = true;
      break;
    }
  }

  if (unicode) {
    // UCS-2 counts UTF-16 code units, so an emoji outside the BMP is two.
    const length = [...body].reduce((total, character) => total + (character.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return { segments: Math.max(1, Math.ceil(length / (length <= 70 ? 70 : 67))), unicode: true, length };
  }

  return {
    segments: Math.max(1, Math.ceil(units / (units <= 160 ? 160 : 153))),
    unicode: false,
    length: units,
  };
}

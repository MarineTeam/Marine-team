import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, messagesFor, pickLocale, type Locale, type Messages } from "./index";

/**
 * Which language this request is in.
 *
 * A cookie rather than only the device settings in `localStorage`, and that is
 * the whole reason this file exists: pages here are server-rendered, and the
 * server cannot read localStorage. A language chosen in the browser but
 * invisible to the server would mean every page arriving in English and
 * flipping to Spanish a moment later — which is worse than not offering the
 * choice.
 *
 * So the switcher writes both: the cookie for the server, the device setting
 * so it travels with the rest of a device's preferences.
 *
 * With no cookie, the browser's own `Accept-Language` decides. Somebody whose
 * phone is in Spanish should not have to find a setting.
 */
export async function currentLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return pickLocale((await headers()).get("accept-language"));
}

/** The strings for this request, resolved once. */
export async function currentMessages(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await currentLocale();
  return { locale, t: messagesFor(locale) };
}

export { DEFAULT_LOCALE };

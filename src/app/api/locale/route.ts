import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isLocale, LOCALE_COOKIE, LOCALES } from "@/lib/i18n";

/**
 * Remembers the language on the server side of the browser.
 *
 * A cookie rather than only the device settings: pages here render on the
 * server, which cannot read localStorage, so a choice it can't see would mean
 * every page arriving in English and flipping a moment later.
 *
 * No account needed — a language is a preference, not a permission, and the
 * visitor who most needs it is the one who has never signed in.
 */
const schema = z.object({ locale: z.string() });

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function POST(request: NextRequest) {
  try {
    const { locale } = schema.parse(await request.json());
    if (!isLocale(locale)) {
      return NextResponse.json({ error: `Unknown language. Try one of: ${LOCALES.join(", ")}` }, { status: 400 });
    }

    const response = NextResponse.json({ locale });
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: ONE_YEAR,
      path: "/",
      sameSite: "lax",
      // Deliberately readable by script: the switcher shows the current
      // choice, and this carries nothing worth protecting.
      httpOnly: false,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

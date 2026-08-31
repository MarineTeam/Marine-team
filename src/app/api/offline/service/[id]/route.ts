import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { fingerprintLines } from "@/lib/fingerprint";
import {
  getServicePlan,
  planItemHref,
  planItemNumber,
  planItemPresentable,
  planItemReadable,
  planItemTitle,
  planItemTitles,
} from "@/lib/services";

/**
 * A service's running order, for a device with no connection.
 *
 * The books could already be saved; the sheet naming which hymns to open
 * could not — and in a hall with no signal the sheet is what you need first.
 * It is a couple of kilobytes, so this hands the whole thing over at once and
 * the browser keeps it in Cache Storage (see lib/offline-services.ts).
 *
 * The checks are the ones the plan's own page applies, in the same order: the
 * plan is published, and saving to a device is switched on. A hymn this
 * viewer can't open stays in the order — it is being sung either way — but
 * travels without a link, exactly as the page renders it.
 *
 * `?probe=1` answers with the fingerprint alone, for a device asking whether
 * the order it saved on Wednesday is still the order.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [user, plan] = await Promise.all([getCurrentUser(), getServicePlan(id)]);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await isPluginEnabled("service-plans"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // The same switch that decides whether a video may be downloaded — saving
    // anything to a device is the same permission. A plan belongs to no
    // section, so this is the site-wide setting.
    if (!(await isPluginEnabled("downloads"))) {
      return NextResponse.json(
        { error: "Saving for offline is turned off." },
        { status: 409 },
      );
    }

    const isLoggedIn = Boolean(user);
    // The hymn's name rather than the book's — a saved order is read without
    // anything to check it against, so it has to say what is being sung.
    const titles = await planItemTitles(plan.items);
    const items = plan.items.map((item) => {
      const readable = planItemReadable(item, isLoggedIn);
      return {
        title: planItemTitle(item, titles),
        number: planItemNumber(item),
        note: item.note,
        // A hymn this viewer can't open is listed without anywhere to go,
        // which is what the page does too.
        href: readable ? planItemHref(item) : null,
        fileId: item.file.id,
        hymnNumber: item.hymnNumber,
        presentable: readable && planItemPresentable(item),
      };
    });

    // Over what is actually being handed out, so a saved copy and this answer
    // are fingerprinted from the same thing — including whether a hymn has
    // become unopenable since, which changes the sheet somebody is reading.
    const fingerprint = fingerprintLines(
      items.map(
        (item) => `${item.fileId}|${item.hymnNumber ?? ""}|${item.number ?? ""}|${item.title}|${item.note ?? ""}|${item.href ?? ""}\n`,
      ),
    );

    if (request.nextUrl.searchParams.get("probe") === "1") {
      return NextResponse.json(
        { id: plan.id, fingerprint, items: items.length },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      {
        id: plan.id,
        title: plan.title,
        serviceDate: plan.serviceDate,
        notes: plan.notes,
        fingerprint,
        items,
      },
      // Per viewer and only ever fetched deliberately; there is nothing here
      // for a shared cache to hold.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

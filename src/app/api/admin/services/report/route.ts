import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { songsSungBetween } from "@/lib/services";
import { toCsv } from "@/lib/csv";

/**
 * "What we sang" as a spreadsheet, for filing a licence return.
 *
 * Same gate as building a plan (`manage_files`), since this is a reading of
 * exactly that data. One row per song, with the dates it was sung on in a
 * single cell — a return wants the count, and the dates are what somebody
 * checks it against.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");

    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!day.test(from) || !day.test(to)) {
      return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
    }

    const songs = await songsSungBetween(
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T23:59:59.999Z`),
    );

    const csv = toCsv(
      songs.map((song) => ({
        song: song.title,
        number: song.number ?? "",
        book: song.book ?? "",
        ccliNumber: song.ccliNumber ?? "",
        author: song.author ?? "",
        copyright: song.copyright ?? "",
        times: song.times,
        dates: song.dates.join(" "),
      })),
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="songs-${from}-to-${to}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

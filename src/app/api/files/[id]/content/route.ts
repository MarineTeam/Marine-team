import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile } from "@/lib/content";
import { bunnyStorageSignedUrl } from "@/lib/bunny";
import { readerFormat } from "@/lib/reader";

/**
 * Streams a readable file's bytes back through our own origin.
 *
 * Two reasons this exists rather than pointing the reader straight at
 * `bunnyStoragePublicUrl`:
 *
 * 1. **Access.** That URL is genuinely public — the member-only flag on a
 *    file only ever hid the download button, never the bytes. pdf.js and
 *    epub.js need a URL they can fetch repeatedly, so handing out the
 *    storage URL would publish every members-only book to anyone who
 *    guessed the path. Here `canViewFile` runs first, on every request,
 *    against the live session.
 * 2. **Origin.** Bunny's pull zone is a different origin, so a client-side
 *    fetch of it is subject to CORS. Rather than depend on a pull-zone
 *    setting that's invisible from the codebase and easy to get wrong,
 *    this keeps the fetch same-origin.
 *
 * Range requests are forwarded upstream and their 206 passed through
 * verbatim: pdf.js fetches large documents in chunks rather than pulling
 * the whole file, and without this it would silently fall back to
 * downloading all of it before rendering page one.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [user, file] = await Promise.all([getCurrentUser(), getReadableFile(id)]);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const format = readerFormat(file.mimeType, file.bunnyPath);
    if (!format) return NextResponse.json({ error: "Not a readable file" }, { status: 415 });

    const range = request.headers.get("range");
    const upstream = await fetch(bunnyStorageSignedUrl(file.bunnyPath), {
      headers: range ? { Range: range } : undefined,
      // Signed URLs are short-lived and the response is per-viewer; nothing
      // here should be reused for the next request or the next person.
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      // Bunny's own body can quote storage-zone internals, so it never
      // reaches the browser — see errorResponse's reasoning in api-guard.
      console.error(`Bunny Storage fetch failed for file ${id}: ${upstream.status}`);
      return NextResponse.json({ error: "Could not load this file" }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", format === "pdf" ? "application/pdf" : "application/epub+zip");
    // Inline: this is the reader fetching bytes to render, not a download.
    headers.set("Content-Disposition", "inline");
    // Advertised so pdf.js asks for ranges in the first place; it probes with
    // a HEAD-ish first request and only chunks when it sees this.
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, no-store");
    for (const header of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

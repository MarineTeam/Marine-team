import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile } from "@/lib/content";
import { bunnyStorageSignedUrl } from "@/lib/bunny";
import { contentDispositionFilename, etagMatches, readerFormat } from "@/lib/reader";

/**
 * Streams a file's bytes through our own origin, for both the in-app reader
 * and the Download button.
 *
 * This is the *only* URL the app hands out for a file. The alternative —
 * `bunnyStoragePublicUrl` — is a permanent, unauthenticated CDN link: it
 * can't be revoked, it works for anyone who has ever seen it, and it can't
 * express a rule like "public until this series is marked members-only",
 * which is exactly the rule this app has. Serving here means `canViewFile`
 * runs against the live session on every single request, so revoking access
 * takes effect immediately rather than whenever a CDN cache expires.
 *
 * It also keeps the fetch same-origin (no CORS setting to get wrong on the
 * pull zone) and works whether or not Bunny's Token Authentication is
 * enabled, since `bunnyStorageSignedUrl` signs the upstream request when a
 * key is configured and passes through unsigned when it isn't.
 *
 * Range requests are forwarded and 206s passed through verbatim: pdf.js
 * fetches large documents in chunks, and audio scrubbing depends on it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [user, file] = await Promise.all([getCurrentUser(), getReadableFile(id)]);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = request.headers.get("range");
    const ifNoneMatch = request.headers.get("if-none-match");
    const ifModifiedSince = request.headers.get("if-modified-since");

    const upstreamHeaders = new Headers();
    if (range) upstreamHeaders.set("Range", range);
    // Forwarded so Bunny can answer a re-open with a 304 of its own, and so
    // the validators below are the ones this viewer actually holds.
    if (ifNoneMatch) upstreamHeaders.set("If-None-Match", ifNoneMatch);
    if (ifModifiedSince) upstreamHeaders.set("If-Modified-Since", ifModifiedSince);

    const upstream = await fetch(bunnyStorageSignedUrl(file.bunnyPath), {
      headers: upstreamHeaders,
      // Signed URLs are short-lived and the response is per-viewer; nothing
      // here should be reused for the next request or the next person.
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
      // Bunny's own body can quote storage-zone internals, so it never
      // reaches the browser — see errorResponse's reasoning in api-guard.
      console.error(`Bunny Storage fetch failed for file ${id}: ${upstream.status}`);
      return NextResponse.json({ error: "Could not load this file" }, { status: 502 });
    }

    // A reader needs the precise type; everything else is served as whatever
    // was recorded at upload, falling back to a type browsers won't try to
    // interpret rather than guessing.
    const format = readerFormat(file.mimeType, file.bunnyPath);
    const contentType =
      format === "pdf"
        ? "application/pdf"
        : format === "epub"
          ? "application/epub+zip"
          : (file.mimeType ?? "application/octet-stream");

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      request.nextUrl.searchParams.get("download") === "1"
        ? `attachment; ${contentDispositionFilename(file.title, file.bunnyPath)}`
        : "inline",
    );
    // Advertised so pdf.js asks for ranges in the first place; it only chunks
    // when it sees this.
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", cacheControlFor(format));
    for (const header of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }

    // Bunny answered the conditional request itself: the viewer already has
    // these bytes, and re-opening a book costs a request rather than a
    // download.
    if (upstream.status === 304) return bodylessNotModified(headers);

    // Bunny doesn't always honour a conditional request, so the comparison is
    // made here too rather than sending megabytes the browser already holds.
    // Skipped for a range request: a 304 there would be answered from a
    // partial cache entry, and pdf.js is asking for a specific slice.
    if (!range && etagMatches(ifNoneMatch, upstream.headers.get("etag"))) {
      void upstream.body?.cancel();
      return bodylessNotModified(headers);
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * How long a viewer's own browser may hold a file.
 *
 * A book is the one thing here worth caching: a scanned hymnal is tens of
 * megabytes that never change, re-fetched every time someone opens it to
 * find a hymn on Sunday morning. `no-cache` is what makes that cheap without
 * giving anything away — it lets the browser *store* the file but requires it
 * to ask before reusing it, so this route still runs `canViewFile` against
 * the live session on every open. A member who has lost access gets a 403 on
 * their next open, exactly as before; a member who still has it gets a
 * bodyless 304 and the file from disk.
 *
 * Everything else keeps `no-store`. The saving there is smaller (audio and
 * video are streamed as ranges, which caches poorly anyway) and a downloaded
 * document left on disk for a shared or borrowed device is a cost with no
 * matching benefit. `private` on both: the answer depends on who is asking,
 * so a shared cache holding one viewer's copy would hand it to the next.
 */
function cacheControlFor(format: ReturnType<typeof readerFormat>): string {
  return format ? "private, no-cache" : "private, no-store";
}

/**
 * A 304 carries validators and caching rules but no entity headers — a
 * Content-Length of the file it isn't sending would have some clients wait
 * for a body that never comes.
 */
function bodylessNotModified(headers: Headers): NextResponse {
  const notModified = new Headers();
  for (const header of ["cache-control", "etag", "last-modified", "accept-ranges"]) {
    const value = headers.get(header);
    if (value) notModified.set(header, value);
  }
  return new NextResponse(null, { status: 304, headers: notModified });
}

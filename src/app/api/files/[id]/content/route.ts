import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile } from "@/lib/content";
import { bunnyStorageSignedUrl } from "@/lib/bunny";
import { contentDispositionFilename, readerFormat } from "@/lib/reader";

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
    // Never shared or stored: the answer depends on who is asking, so a
    // shared cache holding one viewer's copy would hand it to the next.
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

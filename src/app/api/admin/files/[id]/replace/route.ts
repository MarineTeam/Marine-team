import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureContentAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  bunnyListStorageFiles,
  bunnyPublicStorageDelete,
  bunnyStoragePublicUrl,
  bunnyStorageUpload,
} from "@/lib/bunny";
import { syncPodcastMirror } from "@/lib/podcast-mirror";
import { isCompatibleReplacement, readerFormat } from "@/lib/reader";

/**
 * Points an existing file row at different bytes — a re-scanned hymnal, a
 * corrected handout — keeping the row itself.
 *
 * Uploading the new version as a *new* file would be the obvious thing to do
 * and is quietly wrong: everything that refers to a book refers to its row.
 * Members' saved places and marks, a `?page=` link on a contents list, a
 * podcast episode's identity, and every copy saved to a phone for offline
 * reading all hang off this id. A new row leaves all of that pointing at last
 * year's scan, with nothing to say it has been superseded.
 *
 * Two ways in, because the app's own upload runs through a serverless
 * function capped at 4MB and a scanned hymnal is nowhere near that:
 *
 * - `multipart/form-data` with `file`, for something small; or
 * - `{ "path": "hymnals/gsfh1-2026.pdf" }`, adopting an object already
 *   uploaded straight to Bunny Storage — the same route in as the importer.
 *
 * The old object is deliberately left in Bunny. Replacing is destructive
 * enough as it is, storage has no undo, and an orphaned object shows up in
 * the storage importer where someone can deal with it once they're happy
 * with the new scan.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type NewBytes = { bunnyPath: string; url: string; sizeBytes: number; mimeType: string | null };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;

    const existing = await prisma.fileAsset.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ensureContentAccess(user, {
      seriesId: existing.seriesId,
      categoryId: existing.categoryId,
    });

    const replacement = request.headers.get("content-type")?.includes("application/json")
      ? await fromStorage(await request.json())
      : await fromUpload(await request.formData());
    if ("error" in replacement) {
      return NextResponse.json({ error: replacement.error }, { status: replacement.status });
    }

    // A book's stored places are in its own terms — a PDF page number, an
    // EPUB CFI — so swapping one format for the other turns every saved
    // place and mark into nonsense. Same-format replacement is what this is
    // for; anything else is a different file, and should be one.
    const wasFormat = readerFormat(existing.mimeType, existing.bunnyPath);
    const nowFormat = readerFormat(replacement.mimeType, replacement.bunnyPath);
    if (
      !isCompatibleReplacement(
        { mimeType: existing.mimeType, path: existing.bunnyPath },
        { mimeType: replacement.mimeType, path: replacement.bunnyPath },
      )
    ) {
      return NextResponse.json(
        {
          error: `This file is ${wasFormat ? `a ${wasFormat.toUpperCase()}` : "not a book"} and the replacement is ${
            nowFormat ? `an ${nowFormat.toUpperCase()}` : "not"
          }. Replace a book with the same kind of book, or add it as a new file.`,
        },
        { status: 400 },
      );
    }

    const stalePublicPath = existing.publicPath;
    const [file] = await prisma.$transaction([
      prisma.fileAsset.update({
        where: { id },
        data: {
          bunnyPath: replacement.bunnyPath,
          url: replacement.url,
          sizeBytes: replacement.sizeBytes,
          mimeType: replacement.mimeType,
          // All of these were derived from the *previous* bytes: a cover of
          // its first page, a count of its bookmarks, when its contents were
          // read and when its pages were. Cleared rather than kept, so a grid shows the new book
          // (working them out live) instead of confidently showing the old
          // one until someone notices — and so the row turns up again in the
          // indexing pass rather than looking already done.
          coverDataUrl: null,
          hymnCount: null,
          contentsIndexedAt: null,
          textIndexedAt: null,
          // The public copy is of the old bytes and lives at a path derived
          // from the old storage path. Cleared here so the sync below treats
          // this as a file that needs mirroring afresh.
          publicPath: null,
        },
      }),
      // The indexed hymns are page numbers into the bytes that just went
      // away. Left behind, a search would send someone to a page of the new
      // scan that holds something else entirely — worse than not finding it.
      prisma.bookHymn.deleteMany({ where: { fileId: id } }),
      // Likewise the text read off the old pages: page 231 of the new scan
      // is a different page, and a search hit that opens it would be
      // confidently wrong rather than simply missing.
      prisma.bookPage.deleteMany({ where: { fileId: id } }),
    ]);

    if (stalePublicPath) {
      try {
        await bunnyPublicStorageDelete(stalePublicPath);
      } catch (error) {
        // The row no longer claims it, so the feed is already correct; a
        // leftover object in the public zone is a cleanup job, not a failure
        // worth refusing the replacement over.
        console.error(`Couldn't remove the old public copy for file ${id}:`, error);
      }
    }

    await logAudit(
      user.email,
      "replace",
      "file",
      id,
      `${existing.title}: ${existing.bunnyPath} → ${replacement.bunnyPath}`,
    );
    // Re-mirrors the new bytes if this is a podcast episode and still qualifies.
    await syncPodcastMirror(id);

    return NextResponse.json(file);
  } catch (error) {
    return errorResponse(error);
  }
}

/** A small file sent to us, uploaded to a fresh path of its own. */
async function fromUpload(form: FormData): Promise<NewBytes | { error: string; status: number }> {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Missing file", status: 400 };
  if (file.size === 0) return { error: "That file is empty", status: 400 };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit — upload it to Bunny Storage and choose it here instead.`,
      status: 400,
    };
  }

  // A new path rather than overwriting the old one: the pull zone caches by
  // URL, so writing different bytes to the same path leaves the CDN — and
  // every browser holding a copy — serving the old file until something
  // expires. A new path can't be stale.
  const bunnyPath = `files/${crypto.randomUUID()}-${file.name}`;
  const url = await bunnyStorageUpload(bunnyPath, Buffer.from(await file.arrayBuffer()), file.type);
  return { bunnyPath, url, sizeBytes: file.size, mimeType: file.type || null };
}

/** An object already in Bunny Storage, adopted the way the importer does it. */
async function fromStorage(body: unknown): Promise<NewBytes | { error: string; status: number }> {
  const path = (body as { path?: unknown })?.path;
  if (typeof path !== "string" || !path.trim()) return { error: "Missing path", status: 400 };

  // Checked against a live listing rather than trusted: it stops a typo
  // becoming a row that points at nothing, and the real size and content
  // type come from Bunny rather than from the browser.
  const { objects } = await bunnyListStorageFiles();
  const object = objects.find((candidate) => candidate.path === path);
  if (!object) return { error: `Not found in Bunny Storage: ${path}`, status: 400 };

  // Two rows sharing one object would make either one's cleanup break the
  // other, so an object already spoken for isn't offered — trashed rows
  // included, since their objects survive until the trash is purged.
  const claimed = await prisma.fileAsset.findFirst({
    where: { bunnyPath: path },
    select: { id: true, title: true },
  });
  if (claimed) {
    return { error: `Another file already uses that object: ${claimed.title}`, status: 409 };
  }

  return {
    bunnyPath: object.path,
    url: bunnyStoragePublicUrl(object.path),
    sizeBytes: object.sizeBytes,
    mimeType: object.contentType,
  };
}

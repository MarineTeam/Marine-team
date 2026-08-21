import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, hasCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bunnyDeleteStreamVideo, bunnyStorageDelete } from "@/lib/bunny";
import { purgePodcastMirror, syncPodcastMirror, syncSeriesPodcastMirror } from "@/lib/podcast-mirror";
import type { CapabilityKey } from "@/lib/capabilities";
import type { User } from "@prisma/client";

const typeSchema = z.enum(["category", "series", "video", "file"]);

const CAPABILITY_BY_TYPE: Record<z.infer<typeof typeSchema>, CapabilityKey> = {
  category: "manage_categories",
  series: "manage_series",
  video: "manage_videos",
  file: "manage_files",
};

async function ensureTrashCapability(userArg: User, type: z.infer<typeof typeSchema>) {
  if (!(await hasCapability(userArg, CAPABILITY_BY_TYPE[type]))) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

/** Restores a trashed item — clears deletedAt, making it visible again wherever it was before (subject to its own published/hidden flags). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const user = await ensureStaff();
    const { type: rawType, id } = await params;
    const type = typeSchema.parse(rawType);
    await ensureTrashCapability(user, type);

    let name: string;
    switch (type) {
      case "category":
        name = (await prisma.category.update({ where: { id }, data: { deletedAt: null } })).name;
        break;
      case "series":
        name = (await prisma.series.update({ where: { id }, data: { deletedAt: null } })).title;
        // Restoring can make episodes eligible again, so re-sync rather
        // than leaving them absent from the feed until the next edit.
        await syncSeriesPodcastMirror(id);
        break;
      case "video":
        name = (await prisma.video.update({ where: { id }, data: { deletedAt: null } })).title;
        break;
      case "file":
        name = (await prisma.fileAsset.update({ where: { id }, data: { deletedAt: null } })).title;
        await syncPodcastMirror(id);
        break;
    }
    await logAudit(user.email, "restore", type, id, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Permanently purges a trashed item — for video/file this is the point the underlying Bunny asset actually gets removed. Irreversible. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const user = await ensureStaff();
    const { type: rawType, id } = await params;
    const type = typeSchema.parse(rawType);
    await ensureTrashCapability(user, type);

    let name: string;
    switch (type) {
      case "category": {
        const category = await prisma.category.findUniqueOrThrow({ where: { id } });
        await prisma.category.delete({ where: { id } });
        name = category.name;
        break;
      }
      case "series": {
        const series = await prisma.series.findUniqueOrThrow({ where: { id } });
        await prisma.series.delete({ where: { id } });
        name = series.title;
        break;
      }
      case "video": {
        const video = await prisma.video.findUniqueOrThrow({ where: { id } });
        await bunnyDeleteStreamVideo(video.bunnyVideoId);
        await prisma.video.delete({ where: { id } });
        name = video.title;
        break;
      }
      case "file": {
        const file = await prisma.fileAsset.findUniqueOrThrow({ where: { id } });
        await bunnyStorageDelete(file.bunnyPath);
        // The public copy lives in a different storage zone, so deleting the
        // private object doesn't touch it. Missing this is how a file ends
        // up permanently public with no row left pointing at it.
        await purgePodcastMirror(file.publicPath);
        await prisma.fileAsset.delete({ where: { id } });
        name = file.title;
        break;
      }
    }
    await logAudit(user.email, "purge", type, id, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

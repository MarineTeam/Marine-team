import Link from "next/link";
import { canAccess } from "@/lib/content";
import { readerFormat } from "@/lib/reader";

type FileListItem = {
  id: string;
  title: string;
  bunnyPath: string;
  memberOnly: boolean;
  mimeType: string | null;
};

export function FileList({
  files,
  isLoggedIn,
  readerOn = false,
}: {
  files: FileListItem[];
  isLoggedIn: boolean;
  /** Book reader plugin state for this section; when off, PDFs/EPUBs are download-only as before. */
  readerOn?: boolean;
}) {
  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
      {files.map((file) => {
        const locked = !canAccess(file.memberOnly, isLoggedIn);
        const isAudio = file.mimeType?.startsWith("audio/") ?? false;
        const readable = readerOn ? readerFormat(file.mimeType, file.bunnyPath) : null;
        // Served through the app rather than linking Bunny's pull zone
        // directly. A CDN URL is permanent and unauthenticated: it can't be
        // revoked, and it would keep working after a file (or its series) is
        // made members-only. This URL re-checks access on every request.
        const url = `/api/files/${file.id}/content`;
        return (
          <li key={file.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{file.title}</span>
              {locked ? (
                <span className="text-sm text-zinc-400">Members only</span>
              ) : (
                <div className="flex items-center gap-2">
                  {readable && (
                    <Link
                      href={`/read/${file.id}`}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {readable === "pdf" ? "Read PDF" : "Read EPUB"}
                    </Link>
                  )}
                  {!isAudio && (
                    <a
                      href={`${url}?download=1`}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Download
                    </a>
                  )}
                </div>
              )}
            </div>
            {!locked && isAudio && (
              <audio controls src={url} className="w-full">
                Your browser does not support the audio element.
              </audio>
            )}
          </li>
        );
      })}
    </ul>
  );
}

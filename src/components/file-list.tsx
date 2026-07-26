import { canAccess } from "@/lib/content";

type FileListItem = {
  id: string;
  title: string;
  url: string;
  memberOnly: boolean;
  mimeType: string | null;
};

export function FileList({ files, isLoggedIn }: { files: FileListItem[]; isLoggedIn: boolean }) {
  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
      {files.map((file) => {
        const locked = !canAccess(file.memberOnly, isLoggedIn);
        const isAudio = file.mimeType?.startsWith("audio/") ?? false;
        return (
          <li key={file.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{file.title}</span>
              {locked ? (
                <span className="text-sm text-zinc-400">Members only</span>
              ) : (
                !isAudio && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Download
                  </a>
                )
              )}
            </div>
            {!locked && isAudio && (
              <audio controls src={file.url} className="w-full">
                Your browser does not support the audio element.
              </audio>
            )}
          </li>
        );
      })}
    </ul>
  );
}

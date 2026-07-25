import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeriesBySlug, canAccess } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [series, user] = await Promise.all([getSeriesBySlug(slug), getCurrentUser()]);

  if (!series) notFound();

  const isLoggedIn = Boolean(user);
  const seriesLocked = !canAccess(series.memberOnly, isLoggedIn);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{series.title}</h1>
        {series.description && <p className="mt-2 text-zinc-500">{series.description}</p>}
      </div>

      {seriesLocked ? (
        <MemberGate />
      ) : (
        <>
          {series.videos.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Videos</h2>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {series.videos.map((video) => {
                  const locked = !canAccess(video.memberOnly, isLoggedIn);
                  return (
                    <li key={video.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">{video.title}</p>
                        {video.description && (
                          <p className="text-sm text-zinc-500 line-clamp-1">
                            {video.description}
                          </p>
                        )}
                        {video.status !== "READY" && (
                          <p className="text-xs text-amber-600 mt-1">Processing…</p>
                        )}
                      </div>
                      {locked ? (
                        <span className="text-sm text-zinc-400">Members only</span>
                      ) : (
                        <Link
                          href={`/videos/${video.slug}`}
                          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
                        >
                          Watch
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {series.files.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Files</h2>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {series.files.map((file) => {
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
            </section>
          )}

          {series.videos.length === 0 && series.files.length === 0 && (
            <p className="text-zinc-500">Nothing published in this series yet.</p>
          )}
        </>
      )}
    </div>
  );
}

function MemberGate() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
      <p className="font-medium">This series is for members only.</p>
      <a
        href="/auth/login"
        className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
      >
        Log in to view
      </a>
    </div>
  );
}

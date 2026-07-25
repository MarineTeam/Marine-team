import Link from "next/link";

export function MenuTile({
  href,
  title,
  subtitle,
  thumbnailUrl,
  badge,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-zinc-300 dark:text-zinc-600">
            ▸
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium leading-snug group-hover:underline">{title}</h3>
          {badge && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <span
        aria-hidden
        className="shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400"
      >
        →
      </span>
    </Link>
  );
}

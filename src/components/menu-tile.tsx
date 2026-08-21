import Image from "next/image";
import Link from "next/link";
import { ChevronRightIcon, FolderIcon } from "@/components/icons";

/**
 * A listing entry, in two shapes.
 *
 * `MenuTile` is the standalone card the listing pages have always used — a
 * bordered row that stands on its own with a gap above and below it.
 * `MenuRow` is the same content flattened for a grouped panel, where the
 * hairlines and the single rounded edge belong to the group rather than the
 * row; that's the shape the home listing uses.
 *
 * Both fall back to a folder mark in the brand colour when there's no cover,
 * rather than a grey picture placeholder: a category is a place, and an empty
 * photo frame suggests a missing image instead of a section to open.
 */

type TileProps = {
  href: string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  badge?: string;
  tags?: string[];
};

function TileMedia({ thumbnailUrl, size }: { thumbnailUrl?: string | null; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-11 w-11";

  if (!thumbnailUrl) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center text-accent`}>
        <FolderIcon className={size === "lg" ? "h-8 w-8" : "h-6 w-6"} />
      </span>
    );
  }

  return (
    <span className={`relative ${box} shrink-0 overflow-hidden rounded-lg bg-chip`}>
      {/*
        unoptimized: a series/category cover is a freeform admin-pasted URL
        (any host), and a video thumbnail is a Bunny signed URL that can expire
        before Next's optimizer re-fetches it — see next.config.ts.
      */}
      <Image src={thumbnailUrl} alt="" fill unoptimized className="object-cover" />
    </span>
  );
}

function TileText({ title, subtitle, badge, tags }: Omit<TileProps, "href" | "thumbnailUrl">) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h3 className="truncate leading-snug font-medium text-ink">{title}</h3>
        {badge && (
          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 line-clamp-1 text-sm text-sec">{subtitle}</p>}
      {tags && tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded bg-chip px-1.5 py-0.5 text-xs text-sec">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The standalone card, for listings that space their entries apart. */
export function MenuTile({ href, title, subtitle, thumbnailUrl, badge, tags }: TileProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-sep bg-panel p-3 transition-colors hover:bg-hover"
    >
      <TileMedia thumbnailUrl={thumbnailUrl} size="lg" />
      <TileText title={title} subtitle={subtitle} badge={badge} tags={tags} />
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ter transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** The flattened row, for a panel of entries divided by hairlines. */
export function MenuRow({ href, title, subtitle, thumbnailUrl, badge, tags }: TileProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-hover"
    >
      <TileMedia thumbnailUrl={thumbnailUrl} size="sm" />
      <TileText title={title} subtitle={subtitle} badge={badge} tags={tags} />
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ter transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";

/**
 * The grouped list rows the settings-style screens are built from: a small
 * uppercase heading over a single rounded panel of rows, hairlines between
 * them.
 *
 * The shape is deliberately the one every phone OS uses for settings, because
 * that's what the installed app is standing in for — and it reads perfectly
 * well as a website too, so there's one implementation rather than a web and
 * an app variant.
 */
export function ListGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      {label && (
        <h2 className="px-1 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">{label}</h2>
      )}
      <div className="divide-y divide-sep overflow-hidden rounded-xl border border-sep bg-panel">
        {children}
      </div>
    </section>
  );
}

export function ListRow({
  href,
  icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  /** Shown right-aligned before the chevron — a count, a state, "3 unread". */
  value?: string;
  /** A second line under the label, for rows that need a sentence of explanation. */
  detail?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
      {icon && <span className="shrink-0 text-accent">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{label}</span>
        {detail && <span className="mt-0.5 block truncate text-xs text-sec">{detail}</span>}
      </span>
      {value && <span className="shrink-0 text-[13px] text-sec">{value}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ter" />
    </Link>
  );
}

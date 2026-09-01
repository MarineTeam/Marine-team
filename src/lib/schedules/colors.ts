/**
 * Schedule accent colours.
 *
 * Stored as a token ("amber") rather than a class string, because Tailwind
 * only emits classes it can see in source. The full class names are written
 * out literally here so the compiler keeps them; anything dynamic would be
 * silently dropped from the build.
 */

export const SCHEDULE_COLORS = [
  "slate",
  "amber",
  "rose",
  "emerald",
  "sky",
  "violet",
  "orange",
  "teal",
] as const;

export type ScheduleColor = (typeof SCHEDULE_COLORS)[number];

interface ColorClasses {
  /** Soft background for a chip or card accent. */
  chip: string;
  /** Solid dot used in the month grid. */
  dot: string;
  /** Left border on a list row. */
  edge: string;
  /** Selected state for a filter chip. */
  selected: string;
}

const CLASSES: Record<ScheduleColor, ColorClasses> = {
  slate: {
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    dot: "bg-slate-500",
    edge: "border-l-slate-400",
    selected: "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    dot: "bg-amber-500",
    edge: "border-l-amber-400",
    selected: "bg-amber-600 text-white dark:bg-amber-400 dark:text-amber-950",
  },
  rose: {
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    dot: "bg-rose-500",
    edge: "border-l-rose-400",
    selected: "bg-rose-600 text-white dark:bg-rose-400 dark:text-rose-950",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dot: "bg-emerald-500",
    edge: "border-l-emerald-400",
    selected: "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950",
  },
  sky: {
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    dot: "bg-sky-500",
    edge: "border-l-sky-400",
    selected: "bg-sky-600 text-white dark:bg-sky-400 dark:text-sky-950",
  },
  violet: {
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    dot: "bg-violet-500",
    edge: "border-l-violet-400",
    selected: "bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950",
  },
  orange: {
    chip: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    dot: "bg-orange-500",
    edge: "border-l-orange-400",
    selected: "bg-orange-600 text-white dark:bg-orange-400 dark:text-orange-950",
  },
  teal: {
    chip: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    dot: "bg-teal-500",
    edge: "border-l-teal-400",
    selected: "bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950",
  },
};

export function isScheduleColor(value: string): value is ScheduleColor {
  return (SCHEDULE_COLORS as readonly string[]).includes(value);
}

export function scheduleColorClasses(color: string): ColorClasses {
  return CLASSES[isScheduleColor(color) ? color : "slate"];
}

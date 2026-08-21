"use client";

/**
 * The tri-state download control shared by the category, series, and video
 * edit forms.
 *
 * Three values rather than a checkbox because "not set" has to be
 * distinguishable from "off": a series left alone should follow whatever its
 * category says, and follow it *later* too if the category changes — which a
 * boolean can't express. The label spells out what inheriting currently
 * resolves to, since "Inherit" alone tells an admin nothing about the
 * outcome.
 */
export function DownloadOverrideSelect({
  value,
  onChange,
  inheritedLabel,
  id = "downloadEnabled",
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  /** What inheriting resolves to right now, e.g. "from its category: allowed". */
  inheritedLabel: string;
  id?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Downloads
      </label>
      <select
        id={id}
        value={value === null ? "inherit" : value ? "on" : "off"}
        onChange={(e) => onChange(e.target.value === "inherit" ? null : e.target.value === "on")}
        className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
      >
        <option value="inherit">Inherit ({inheritedLabel})</option>
        <option value="on">Allow downloads</option>
        <option value="off">Block downloads</option>
      </select>
      <p className="mt-1 text-xs text-sec">
        Only applies while the Downloads plugin is on, and never lets someone download what they can&apos;t watch.
      </p>
    </div>
  );
}

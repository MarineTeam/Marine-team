/**
 * Rows to CSV, for the exports an admin pulls into a spreadsheet.
 *
 * Headers come from the first row's keys, so callers build rows in the shape
 * they want the columns. Quoting is the minimum that keeps a spreadsheet
 * honest: a value containing a comma, a quote or a newline is wrapped and its
 * quotes doubled, which is what every reader expects.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

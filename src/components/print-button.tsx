"use client";

/**
 * Prints the page it sits on.
 *
 * A button rather than "use your browser's print command" because the people
 * this is for — whoever is handing out the running order before a service —
 * shouldn't have to know where that lives on the machine in the church
 * office. It hides itself on the printed sheet, along with the rest of the
 * app's chrome (see the print rules in globals.css).
 */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
    >
      {label}
    </button>
  );
}

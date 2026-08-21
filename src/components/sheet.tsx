"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A full-screen panel over the page, with the keyboard and scroll handling a
 * modal needs.
 *
 * Extracted so the app's navigation menu and the admin's section list share
 * one implementation: an overlay the keyboard can't escape or dismiss is a
 * trap, and that logic rotting in one of two copies is how it happens.
 *
 * The opener stays with the caller — only the panel lives here — because each
 * one wants its own trigger, label and placement.
 */
export function Sheet({
  open,
  onClose,
  title,
  /** Focus returns here on close; pass the element that opened the sheet. */
  returnFocusTo,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const opener = returnFocusTo?.current ?? null;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Focus the panel itself rather than its first control, so a screen reader
    // announces the dialog before what's inside it.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (opener ?? previouslyFocused)?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="pad-top-safe pad-bottom-safe fixed inset-0 z-50 flex flex-col bg-panel outline-none"
    >
      <div className="flex items-center gap-4 border-b border-sep px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="-m-2 rounded-md p-2 text-ink hover:bg-hover"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        <span className="font-semibold text-ink">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>,
    document.body,
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Right-hand detail panel.
 *
 * Closing is driven by the caller (which navigates back), so the panel stays
 * deep-linkable: the URL is the source of truth for what's open, browser-back
 * closes it, and the view can be shared.
 */
export function SlideOver({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Stop the page behind from scrolling under the panel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 animate-fade-in"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-2xl bg-surface border-l border-line shadow-panel",
          "overflow-y-auto animate-slide-in-right outline-none",
          className
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3.5 bg-surface/95 backdrop-blur border-b border-line">
          <p className="text-xs text-muted truncate">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-muted hover:text-hi hover:bg-raised transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

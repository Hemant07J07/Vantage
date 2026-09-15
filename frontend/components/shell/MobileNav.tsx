"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isNavActive } from "@/lib/nav";
import { Wordmark } from "./Wordmark";

/**
 * Navigation for narrow screens.
 *
 * The sidebar is `hidden md:flex`, so without this every dashboard section
 * except the current one was simply unreachable on a phone.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden p-1.5 -ml-1.5 rounded-lg text-muted hover:text-hi hover:bg-raised transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="w-4 h-4" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 animate-fade-in"
          />
          <nav className="relative w-64 bg-surface border-r border-line flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-4 border-b border-line">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-hi"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm",
                        active
                          ? "bg-accent-soft text-hi font-medium"
                          : "text-muted hover:text-hi hover:bg-raised"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", active ? "text-accent" : "text-faint")} />
                      <span className="flex-1">{item.label}</span>
                      {item.status === "soon" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-line-strong" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}

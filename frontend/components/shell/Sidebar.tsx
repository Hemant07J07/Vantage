"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isNavActive } from "@/lib/nav";
import { Wordmark } from "./Wordmark";
import { AgentStatusRail } from "./AgentStatusRail";

/**
 * Icon rail that opens on hover and closes when the pointer leaves.
 *
 * The behaviour lives in the `.rail` rules in `app/globals.css` — width,
 * the open delay, and the label fade — because the wordmark's text has to be
 * targeted by structure (`components/shell/Wordmark.tsx` is never edited, so
 * there is no prop to hang a class on).
 *
 * The important bit is `sticky`, not `fixed`. As a real flex child the rail
 * **pushes** the page across when it opens. The first version was `fixed`
 * beside a spacer, so expanding painted over the heading and cards of
 * whatever you were reading.
 *
 * `focus-within` matches the hover rules throughout: without it the labels
 * would be unreachable for anyone navigating by keyboard.
 *
 * Labels stay mounted at `opacity: 0` rather than being unmounted, so the
 * collapsed rail reads identically to a screen reader.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "rail hidden md:flex sticky top-0 h-screen shrink-0 z-40 flex-col overflow-hidden",
        "border-r border-line bg-surface/70 backdrop-blur-xl"
      )}
    >
      {/*
        `pl-5` puts the 28px glyph's centre at 34px — the same centre as the
        nav icons in their 52px column below, so the mark sits on the rail's
        spine at either width. The wordmark text is faded by `.rail-lockup`
        rather than cropped; components/shell/Wordmark.tsx is not touched.
      */}
      <div className="h-[76px] shrink-0 flex items-center border-b border-line">
        <Link
          href="/dashboard"
          aria-label="Vantage — go to overview"
          className="rail-lockup flex items-center h-full pl-5 w-[236px] shrink-0"
        >
          <Wordmark />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative group/item flex items-center h-11 rounded-xl w-[220px] shrink-0",
                    "transition-colors",
                    active
                      ? "bg-accent/[0.14] text-hi"
                      : "text-muted hover:text-hi hover:bg-white/[0.045]",
                    // The inset marker bar on the active item.
                    active &&
                      "before:absolute before:left-0 before:inset-y-2.5 before:w-[3px] before:rounded-r-full before:bg-accent"
                  )}
                >
                  <span className="w-[52px] shrink-0 grid place-items-center">
                    <Icon
                      className={cn(
                        "w-[18px] h-[18px]",
                        active ? "text-accent" : "text-faint group-hover/item:text-muted"
                      )}
                    />
                  </span>

                  <span
                    className={cn(
                      "rail-reveal flex-1 min-w-0 truncate text-sm",
                      active && "font-medium"
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Marks a section that exists but isn't built yet, so the
                      nav tells the truth instead of offering a dead link. */}
                  {item.status === "soon" && (
                    <span
                      className="rail-reveal mr-3 w-1.5 h-1.5 rounded-full bg-line-strong shrink-0"
                      title="Coming soon"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <AgentStatusRail />
    </aside>
  );
}

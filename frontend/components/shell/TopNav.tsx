"use client";

import { useRouter } from "next/navigation";
import { Bell, LogOut, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useLive } from "@/components/providers/LiveProvider";
import { useSearch } from "@/components/providers/SearchProvider";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/cn";

export function TopNav({ username }: { username: string }) {
  const router = useRouter();
  const { connected } = useLive();
  const { query, setQuery } = useSearch();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 shrink-0 border-b border-line bg-surface/70 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full px-4 md:px-6 flex items-center gap-3">
        <MobileNav />

        <div className="hidden sm:flex items-center gap-2 flex-1 max-w-[520px]">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts, leads, companies…"
              // `pr-9` clears room for the clear button below without the
              // typed text running underneath it.
              className={cn(
                "w-full h-10 pl-10 pr-9 rounded-xl outline-none",
                "bg-white/[0.04] border border-line text-sm text-body placeholder:text-faint",
                "focus:border-accent/40 focus:bg-white/[0.06] transition-colors"
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-faint hover:text-hi hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ml-auto, not a spacer div: the search box stops growing at its
            520px cap, so without this the leftover width pooled to the RIGHT
            of these controls and left them stranded mid-bar. */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-pill border",
              connected
                ? "bg-ok/10 border-ok/25"
                : "bg-white/[0.04] border-line"
            )}
            title={connected ? "Live updates connected" : "Reconnecting…"}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                connected ? "bg-ok animate-pulse-dot" : "bg-faint"
              )}
            />
            <span
              className={cn(
                "font-mono text-[11px] uppercase tracking-[0.08em]",
                connected ? "text-ok" : "text-muted"
              )}
            >
              {connected ? "Live" : "Offline"}
            </span>
          </span>

          <button
            type="button"
            className="p-2 rounded-lg text-muted hover:text-hi hover:bg-white/[0.05] transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-line" />

          {/* Nothing at all when the username is unknown — a "?" circle would
              be claiming to show who's signed in while admitting it doesn't. */}
          {username && (
            <span className="flex items-center gap-2 min-w-0" title={username}>
              {/* rounded-full overrides the component's rounded-lg via cn()'s
                  tailwind-merge, so the chip reads as a profile, not a tile. */}
              <Avatar name={username} size={28} className="rounded-full" />
              <span className="hidden sm:inline text-xs text-body truncate max-w-[140px]">
                {username}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={logout}
            className="p-2 rounded-lg text-muted hover:text-hi hover:bg-white/[0.05] transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

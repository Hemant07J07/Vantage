"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface SearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * The text typed into the top search bar, shared between `TopNav` (which
 * writes it) and whatever page is open (which reads it) — the two are
 * siblings under this provider, not parent and child, so a shared ancestor
 * is the only way for one to reach the other.
 *
 * Resets on navigation. The provider lives in `app/(dashboard)/layout.tsx`,
 * which persists across page switches — only `{children}` swaps — so a
 * `usePathname()` effect here fires on every real move to a different
 * section and empties the box, which is the "write it again" behaviour
 * asked for. It deliberately does NOT fire on a same-page query-string
 * change (e.g. clicking a status pill while a search is active): that's
 * refining a list, not leaving it, and the query should survive it.
 */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setQuery("");
    // Deliberately keyed on pathname alone — see the doc comment above for
    // why a query-string-only change must not trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <SearchContext.Provider value={{ query, setQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return ctx;
}

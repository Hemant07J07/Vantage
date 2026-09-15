"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSearch } from "@/components/providers/SearchProvider";

const DEBOUNCE_MS = 300;

/**
 * Drives the `?search=` URL param from the shared search box, for pages
 * whose list is paginated on the backend — where a client-only filter would
 * silently miss matches sitting on a page that was never fetched.
 *
 * Renders nothing. The page itself stays a Server Component reading
 * `searchParams.search` exactly like it already reads `status` or `range`;
 * this is only the client-side piece that keeps that param in sync with
 * what's typed, merged alongside whatever other params the page already
 * carries so a search doesn't clobber, say, a `status` filter on Leads.
 */
export function SearchSync() {
  const { query } = useSearch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Guards the first run: on mount, the URL and the (just-reset-to-empty)
  // query are already in whatever state navigation left them in, and firing
  // a redundant replace() here would fight SearchProvider's own reset.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("search", query);
      } else {
        params.delete("search");
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Intentionally excludes `searchParams`/`pathname`/`router` from deps:
    // this should re-run only when the typed text changes, not when the URL
    // it just wrote changes — including them would debounce against its own
    // writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return null;
}

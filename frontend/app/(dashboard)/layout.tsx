import { redirect } from "next/navigation";
import { LiveProvider } from "@/components/providers/LiveProvider";
import { SearchProvider } from "@/components/providers/SearchProvider";
import { SessionKeepalive } from "@/components/providers/SessionKeepalive";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopNav } from "@/components/shell/TopNav";
import { BackendError, backendFetchSafe, getServerToken } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts already gates this, but a layout that assumes a session without
  // checking would render a broken shell if that ever regressed.
  const token = await getServerToken();
  if (!token) redirect("/login");

  // Asked rather than assumed. This used to be the literal string "demo",
  // which was harmless while that was the only account and became wrong the
  // moment anyone could register. An empty username renders as nothing at all
  // rather than as somebody else's name.
  //
  // The catch is what stops a rejected token from becoming an error page.
  // proxy.ts can tell an *expired* token from a live one, but not one Django
  // refuses for any other reason — a secret-key rotation, a deleted user — and
  // an uncaught 401 here renders the error boundary with a 500. Worse, that
  // boundary can't identify it as an auth failure: production builds strip the
  // message it inspects, so it always reports a backend outage instead.
  let me: CurrentUser | null = null;
  let sessionRejected = false;
  try {
    me = await backendFetchSafe<CurrentUser | null>("/auth/me/", null);
  } catch (error) {
    if (!(error instanceof BackendError && error.isAuthError)) throw error;
    sessionRejected = true;
  }
  // Outside the catch on purpose: redirect() signals by throwing, so calling it
  // in there would be caught by its own handler.
  if (sessionRejected) redirect("/login?next=/dashboard");

  return (
    // SearchProvider wraps LiveProvider (rather than the reverse) because it
    // has nothing to do with the websocket — it exists purely so TopNav
    // (which writes the typed text) and {children} (which reads it) have a
    // shared ancestor; they're siblings otherwise. LiveProvider stays
    // mounted here rather than the root layout: the public pages must not
    // open a websocket for an anonymous visitor.
    <SearchProvider>
      <LiveProvider>
        <SessionKeepalive />
        <div className="flex min-h-screen">
          {/* No spacer: the rail is a sticky flex child, so the content beside
              it reflows on its own and is never covered. */}
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0">
            <TopNav username={me?.username ?? ""} />
            <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </LiveProvider>
    </SearchProvider>
  );
}

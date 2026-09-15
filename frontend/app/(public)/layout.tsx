import Link from "next/link";
import { Button } from "@/components/ui";
import { HeroField } from "@/components/shell/HeroField";
import { IntroSplash } from "@/components/shell/IntroSplash";
import { Wordmark } from "@/components/shell/Wordmark";
import { getServerToken } from "@/lib/api";
import { isExpired } from "@/lib/jwt";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A signed-in visitor on the landing page should be offered their dashboard
  // rather than a sign-in link they don't need.
  //
  // Checked for expiry, not just presence: a dead cookie used to still say
  // "Go to dashboard →", which offered a link that could only end in an error.
  const signedIn = !isExpired(await getServerToken());

  return (
    <div className="relative min-h-screen flex flex-col">
      {/*
        Mounted on the public layout rather than the root one on purpose: the
        brand intro belongs to the marketing entry point, and the dashboard
        stays exactly as it was. Living in a layout also means it survives
        client-side navigation between public pages without remounting.
      */}
      <IntroSplash />

      {/*
        Animated hero backdrop. Purely decorative and pointer-events-none, so
        it sits behind the existing markup without altering or intercepting
        anything. Every element below is raised above it with `relative`.
      */}
      <HeroField />

      <header className="relative h-16 border-b border-line">
        <div className="h-full max-w-6xl mx-auto px-5 flex items-center justify-between">
          <Link href="/">
            <Wordmark />
          </Link>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="text-sm text-muted hover:text-hi transition-colors"
            >
              Go to dashboard →
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm text-muted hover:text-hi transition-colors"
              >
                Sign in
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  Create account
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="relative flex-1">{children}</div>

      <footer className="relative border-t border-line py-6">
        <div className="max-w-6xl mx-auto px-5 text-xs text-faint">
          Vantage — AI B2B growth intelligence. Research runs on a locally hosted
          model against publicly available information.
        </div>
      </footer>
    </div>
  );
}

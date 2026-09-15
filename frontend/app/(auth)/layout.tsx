import Link from "next/link";
import { HeroField } from "@/components/shell/HeroField";
import { Wordmark } from "@/components/shell/Wordmark";

/**
 * Shell for signing in and creating an account.
 *
 * Shares the landing page's animated field so arriving here reads as the same
 * product rather than a bare form on a black page. `HeroField` is reused
 * untouched — it takes no props and positions itself absolutely, so all it
 * needs is the `relative` wrapper below and something dark behind it.
 *
 * Deliberately not the (public) layout: that one also mounts IntroSplash and
 * the footer, and replaying the brand intro every time someone mistypes a
 * password would wear thin fast.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <HeroField />

      <header className="relative h-16 shrink-0">
        <div className="h-full max-w-6xl mx-auto px-5 flex items-center">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}

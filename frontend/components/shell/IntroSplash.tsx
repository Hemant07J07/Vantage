"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * First-visit brand intro.
 *
 * An overlay, deliberately not a separate loading route: the real page mounts
 * and fetches underneath while this plays, so the animation costs nothing in
 * time-to-interactive — by the time it lifts, the page beneath is already
 * there.
 *
 * Timeline (ms):
 *    0 –  500   logo fades up from centre
 *  500 – 1800   holds, with a slow glow breath
 * 1800 – 2400   overlay crossfades out
 *         2400  overlay unmounts; page fully interactive
 *
 * Shown once per browser session (sessionStorage), so internal navigation and
 * repeat dashboard visits never replay it.
 */

const SESSION_KEY = "vantage:intro-seen";

const FADE_IN_MS = 500;
const HOLD_UNTIL_MS = 1800;
const FADE_OUT_MS = 600;
const TOTAL_MS = HOLD_UNTIL_MS + FADE_OUT_MS; // 2400

export function IntroSplash() {
  // `null` = still deciding (first client tick). Rendering nothing until we've
  // checked sessionStorage avoids a flash of the splash for repeat visitors.
  const [visible, setVisible] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private mode or blocked storage: fall through and show it once. Not
      // being able to remember is a reason to play it, not to crash.
    }

    if (seen) {
      setVisible(false);
      return;
    }

    // Honour reduced-motion by skipping the animation outright rather than
    // making someone sit through a decorative delay they asked not to see.
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* nothing to do — worst case it plays again next load */
    }

    if (reduced) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const startLeaving = window.setTimeout(() => setLeaving(true), HOLD_UNTIL_MS);
    const unmount = window.setTimeout(() => setVisible(false), TOTAL_MS);

    return () => {
      window.clearTimeout(startLeaving);
      window.clearTimeout(unmount);
    };
  }, []);

  // Lock scrolling only while the overlay is actually up, so the page beneath
  // can't be scrolled out from under it mid-animation.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      // Decorative: nothing here is content, and a screen reader announcing a
      // brand animation is noise.
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-base"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: leaving ? "none" : "auto",
      }}
    >
      <div className="intro-logo">
        <Image
          src="/vantage-mark.png"
          alt=""
          width={132}
          height={128}
          priority
          unoptimized
          className="intro-glow"
        />
      </div>

      <div className="intro-lockup mt-8 text-center">
        <div className="font-display text-2xl font-medium tracking-[0.18em] text-hi">
          VANTAGE
        </div>
        <div className="mt-2 text-[11px] tracking-[0.28em] text-muted">
          AI GROWTH ENGINE
        </div>
      </div>

      <style jsx>{`
        .intro-logo {
          opacity: 0;
          transform: scale(0.965);
          animation: intro-rise ${FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)
            forwards;
        }

        /* The glow breath starts only after the logo has arrived, so the two
           motions read as one gesture rather than competing. */
        .intro-glow {
          animation: intro-breathe 2600ms ease-in-out ${FADE_IN_MS}ms infinite;
        }

        .intro-lockup {
          opacity: 0;
          animation: intro-fade 620ms ease-out 260ms forwards;
        }

        @keyframes intro-rise {
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes intro-fade {
          to {
            opacity: 1;
          }
        }

        @keyframes intro-breathe {
          0%,
          100% {
            filter: drop-shadow(0 0 18px rgba(232, 84, 42, 0.16))
              drop-shadow(0 0 26px rgba(0, 112, 127, 0.14));
          }
          50% {
            filter: drop-shadow(0 0 30px rgba(232, 84, 42, 0.3))
              drop-shadow(0 0 40px rgba(0, 112, 127, 0.24));
          }
        }

        /* Belt-and-braces: the effect is already skipped in JS above, but if
           the preference flips after mount, stop animating immediately. */
        @media (prefers-reduced-motion: reduce) {
          .intro-logo,
          .intro-glow,
          .intro-lockup {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vantage — AI Growth Intelligence",
  description: "AI-qualified B2B leads, scored and routed in real time.",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Fonts are loaded at runtime via <link>, not next/font/google.
          next/font/google fetches font files from Google at Docker BUILD
          time — fine on a normal internet connection, but a real point of
          fragility in CI/CD or network-restricted build environments (and
          inconsistent with this project's local-first stance elsewhere).
          Runtime loading means a blocked/offline build still succeeds; the
          font stacks in globals.css fall back to solid system fonts if the
          browser can't reach Google Fonts either.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

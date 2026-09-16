/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle so the Docker runtime image doesn't
  // need node_modules — see the multi-stage Dockerfile's final stage, which
  // copies .next/standalone and runs its generated server.js directly.
  //
  // Only for the Docker build, not Vercel's: Vercel has its own deployment
  // pipeline for Next.js and doesn't want this — building on Vercel with it
  // set fails after `next build`, during Vercel's own processing of the
  // output. `VERCEL` is a standard env var Vercel sets automatically during
  // its builds, so this stays on for Docker and off for Vercel without two
  // separate config files to keep in sync.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),

  // There was a /backend/:path* rewrite here as a generic proxy escape hatch.
  // Nothing ever called it: every server-side call goes through lib/api.ts, and
  // every browser-side one through an explicit Route Handler under app/api/*.
  // Removed rather than left as a second, undocumented path to Django.
};

module.exports = nextConfig;

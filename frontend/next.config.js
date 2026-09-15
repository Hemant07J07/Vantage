/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle so the runtime image doesn't need
  // node_modules — see the multi-stage Dockerfile.
  output: "standalone",

  // There was a /backend/:path* rewrite here as a generic proxy escape hatch.
  // Nothing ever called it: every server-side call goes through lib/api.ts, and
  // every browser-side one through an explicit Route Handler under app/api/*.
  // Removed rather than left as a second, undocumented path to Django.
};

module.exports = nextConfig;

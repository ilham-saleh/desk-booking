import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  // Don't let `next dev` auto-append an AI-agent notice to CLAUDE.md — it's
  // the project's own hand-curated instructions file, not framework-managed.
  agentRules: false,
};

export default nextConfig;

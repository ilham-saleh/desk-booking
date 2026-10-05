import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  // Don't let `next dev` auto-append an AI-agent notice to CLAUDE.md — it's
  // the project's own hand-curated instructions file, not framework-managed.
  agentRules: false,
  // The dev-only Next.js badge defaults to bottom-left, on top of the sidebar's expand button.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;

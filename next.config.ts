import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image can skip
  // node_modules entirely.
  output: "standalone",

  // Native modules must stay external — bundling them breaks the .node binding.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],

  // Next 16 writes AGENTS.md and CLAUDE.md into the project root by default.
  // This repo does not ship AI tooling files.
  agentRules: false,

  // The dev tools badge defaults to bottom-left, which is exactly where the
  // sidebar footer and its sign-out button sit. Dev-only, but in the way.
  devIndicators: { position: "bottom-right" },

  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

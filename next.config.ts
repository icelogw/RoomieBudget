import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image can skip
  // node_modules entirely.
  output: "standalone",

  // Native modules must stay external — bundling them breaks the .node binding.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],

  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@repo/ui", "@repo/ai", "@repo/db", "@repo/types"],
  // The desktop app (apps/desktop) ships a self-contained server; its stage script sets this.
  output: process.env.SMA_STANDALONE === "1" ? "standalone" : undefined,
  // Trace workspace packages from the monorepo root.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@repo/ui", "@repo/ai", "@repo/types"],
};

export default nextConfig;

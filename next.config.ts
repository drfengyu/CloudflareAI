import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't pick up a parent-dir lockfile.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't pick up a parent-dir lockfile.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  async redirects() {
    return [
      // 文本生成 playground 已并入 AI 对话，旧书签回到新入口。
      { source: "/playground/text", destination: "/chat", permanent: false },
    ];
  },
};

export default nextConfig;

#!/usr/bin/env node

/**
 * 环境变量检查脚本：启动前验证所有必需的 Cloudflare 和 Auth.js 配置。
 * 运行：node scripts/check-env.mjs
 */

const required = [
  "CF_ACCOUNT_ID",
  "CF_API_TOKEN",
  "CF_D1_DATABASE_ID",
  "CF_KV_NAMESPACE_ID",
  "AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("❌ 缺少必需的环境变量：\n");
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error("\n请参考 docs/SETUP.md 配置这些变量。");
  process.exit(1);
}

console.log("✅ 所有必需的环境变量已配置。");

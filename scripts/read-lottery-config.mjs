import { readFileSync } from "node:fs";

// 从 .env.local 读取环境变量
const envFile = readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
console.error("DB ID:", env.CF_D1_DATABASE_ID, "len:", env.CF_D1_DATABASE_ID?.length);

const accountId = env.CF_ACCOUNT_ID;
const apiToken = env.CF_API_TOKEN;
const databaseId = env.CF_D1_DATABASE_ID;

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: "SELECT value FROM option WHERE key = ?", params: ["lottery_config"] }),
  },
);

const body = await res.json();
if (!body.success) {
  console.error("查询失败:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const value = body.result[0]?.results?.[0]?.value;
if (!value) {
  console.log("lottery_config 不存在（使用默认配置）");
  process.exit(0);
}

const config = JSON.parse(value);
console.log(JSON.stringify(config, null, 2));

import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";

// drizzle-kit doesn't read .env.local by default — load it manually.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env.local absent (e.g. CI) — rely on the ambient environment.
}

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    accountId: process.env.CF_ACCOUNT_ID!,
    databaseId: process.env.CF_D1_DATABASE_ID!,
    token: process.env.CF_API_TOKEN!,
  },
});

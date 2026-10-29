import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";

/**
 * v0.8.0 页面冒烟：邀请页、API 文档页、签到连签展示、后台两块新配置。
 * 只读页面，不写业务数据。
 */
function loadEnv() {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

async function d1Query(sql: string, params: unknown[] = []) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`;
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = (await res.json()) as {
    success: boolean;
    errors?: unknown;
    result: Array<{ results: Record<string, unknown>[] }>;
  };
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result[0].results;
}

async function loginAs(
  context: import("@playwright/test").BrowserContext,
  email: string,
) {
  loadEnv();
  const [user] = await d1Query(
    "SELECT id, email, name, role, inviteCode FROM user WHERE email = ?",
    [email],
  );
  if (!user) throw new Error(`user not found: ${email}`);

  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name ?? email,
      role: user.role,
    },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 3600,
  });
  await context.addCookies([
    { name: "authjs.session-token", value: token, url: "http://localhost:3000" },
  ]);
  return user;
}

test("v0.8.0: 用户侧邀请页 / API 文档 / 签到连签", async ({ page, context }) => {
  test.setTimeout(180_000);
  const user = await loginAs(context, "test@example.com");

  await page.goto("/invite", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "邀请好友" })).toBeVisible();
  const inviteCode = (user.inviteCode as string) || "";
  expect(inviteCode.length).toBeGreaterThan(0);
  await expect(page.getByText(inviteCode, { exact: true })).toBeVisible();
  await expect(page.getByText("/register?ref=")).toBeVisible();
  await expect(page.getByText("奖励规则")).toBeVisible();
  await expect(page.getByText("最近邀请")).toBeVisible();

  await page.goto("/docs", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "API 接入指南" })).toBeVisible();
  await expect(page.getByText("http://localhost:3000/v1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/v1/chat/completions", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/v1/messages", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("402", { exact: true }).first()).toBeVisible();

  await page.goto("/wallet", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page.getByText("每日签到", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("连续签到", { exact: true })).toBeVisible();
  await expect(page.getByText(/连续签到每满 7 天，额外奖励 200\.00 cr/)).toBeVisible();
});

test("v0.8.0: 后台邀请与连签配置", async ({ page, context }) => {
  test.setTimeout(180_000);
  await loginAs(context, "drfengling@163.com");

  await page.goto("/admin/settings", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await expect(page.getByText("邀请奖励", { exact: true })).toBeVisible();
  await expect(page.getByText("启用连签奖励", { exact: true })).toBeVisible();
  await expect(page.getByText("连签天数", { exact: true })).toBeVisible();
  await expect(page.getByText("邀请人奖励（credits）", { exact: true })).toBeVisible();
  await expect(page.getByText("被邀请人奖励（credits）", { exact: true })).toBeVisible();
});

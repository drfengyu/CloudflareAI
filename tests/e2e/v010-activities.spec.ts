import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";

/**
 * v0.10.0 活动页只读冒烟：/cashback、/tasks、/wallet 三张页在**活动关闭**时必须正常渲染，
 * 并明确告诉用户「未开启」。全程不写任何数据，也不改 option 配置。
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "test@example.com";

function loadEnv() {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

async function d1Query(sql: string, params: unknown[] = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await res.json()) as {
    success: boolean;
    errors?: unknown;
    result: Array<{ results: Record<string, unknown>[] }>;
  };
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result[0].results;
}

test("v0.10.0 活动页：消费返利 / 任务成就 / 钱包在关闭态下可渲染", async ({ page, context }) => {
  test.setTimeout(420_000);
  loadEnv();

  const [user] = await d1Query("SELECT id, email, name, role FROM user WHERE email = ?", [EMAIL]);
  if (!user) throw new Error("test user missing");
  const token = await encode({
    token: { sub: user.id, email: user.email, name: user.name ?? EMAIL, role: user.role },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 3600,
  });
  await context.addCookies([{ name: "authjs.session-token", value: token, url: BASE_URL }]);

  const guard = async () => {
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Application error");
    expect(body).not.toContain("Unhandled Runtime Error");
  };

  // ---- 1. 侧边栏导航 ----
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 240_000 });
  await expect(page.getByRole("link", { name: "消费返利" })).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole("link", { name: "任务成就" })).toBeVisible();

  // ---- 2. /cashback：关闭态 ----
  await page.goto("/cashback", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "消费返利" })).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("消费返利当前未开启")).toBeVisible();
  await expect(page.getByText("返利规则")).toBeVisible();
  // 关闭态下逐日行只能是「活动未开启」，不能出现可点的领取按钮
  await expect(page.getByRole("button", { name: "领取" })).toHaveCount(0);
  await guard();
  await page.screenshot({ path: "tests/e2e/screenshots/v010-cashback.png", fullPage: true });

  // ---- 3. /tasks：关闭态 + 进度现场统计 ----
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "任务成就" })).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("任务活动当前未开启")).toBeVisible();
  await expect(page.getByText("第一次站内对话", { exact: true })).toBeVisible();
  await expect(page.getByText("跑通一次 API", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "领取" })).toHaveCount(0);
  // 关闭态下逐日/逐任务都归到「活动未开启」，而不是空白或可点按钮
  await expect(page.getByText("活动未开启").first()).toBeVisible();
  await guard();
  await page.screenshot({ path: "tests/e2e/screenshots/v010-tasks.png", fullPage: true });

  // ---- 4. /wallet：充值弹窗在关闭赠送时不出现赠送提示 ----
  await page.goto("/wallet", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "我的钱包" })).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: "充值" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("在线充值")).toBeVisible();
  await expect(dialog.getByText("立即支付")).toBeVisible();
  await expect(dialog.getByText(/本单额外赠送/)).toHaveCount(0);
  await guard();
});

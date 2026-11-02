import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";

/**
 * v0.15.0 翻牌夺宝只读冒烟：/flip 在**活动关闭**时正常渲染「活动未开启」，全程不写任何数据。
 *
 * 断言按线上 `option.flip_config` 的实际状态分支——写死「未开启」会让这个用例在管理员哪天
 * 真的开启活动后必然失败，而「开关状态与界面一致」才是要守住的那件事。
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

/** 线上活动窗口是否真的开着：开关为真且当前北京时间落在起止之间。 */
async function isFlipActive(): Promise<boolean> {
  const rows = await d1Query("SELECT value FROM option WHERE key = ?", ["flip_config"]);
  const raw = (rows[0]?.value as string) ?? "";
  if (!raw) return false;
  try {
    const config = JSON.parse(raw) as { enabled?: boolean; startAt?: string; endAt?: string };
    if (config.enabled !== true) return false;
    const parse = (value?: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec((value ?? "").trim());
      if (!m) return NaN;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) - 8 * 3600_000;
    };
    const start = parse(config.startAt);
    const end = parse(config.endAt);
    const now = Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  } catch {
    return false;
  }
}

test("v0.15.0 翻牌夺宝：/flip 的界面与线上开关状态一致", async ({ page, context }) => {
  test.setTimeout(420_000);
  loadEnv();
  const active = await isFlipActive();

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

  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 240_000 });
  await expect(page.getByRole("link", { name: "翻牌夺宝" })).toBeVisible({ timeout: 240_000 });

  await page.goto("/flip", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "翻牌夺宝" })).toBeVisible({ timeout: 240_000 });
  // 「规则」卡片讲清楚赔率口径，两种状态都该在。
  await expect(page.getByText("规则", { exact: true }).first()).toBeVisible();
  if (active) {
    await expect(page.getByText("活动未开启")).toHaveCount(0);
  } else {
    await expect(page.getByText("活动未开启")).toBeVisible();
    // 关闭态下不能出现任何开局入口
    await expect(page.getByRole("button", { name: /开一局/ })).toHaveCount(0);
  }
  await guard();
  await page.screenshot({ path: "tests/e2e/screenshots/v015-flip-closed.png", fullPage: true });
});

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * v0.8.0 数据流实测（会写生产 D1，仅两个一次性账号，跑完自清理）：
 * 1. A 邮箱注册 → 从 /invite 读邀请码；
 * 2. B 经 /register?ref= 注册 → 校验双方余额、topup type=7、invite_record；
 * 3. 给 B 预置前 6 天签到 → 点「立即签到」→ 校验 streak=7、额外 200 cr 进临时余额；
 * 4. 删除 A/B 全部痕迹并复验既有账号余额未变。
 */
const STAMP = Date.now().toString(36);
const A_EMAIL = `v080-a-${STAMP}@example.com`;
const B_EMAIL = `v080-b-${STAMP}@example.com`;
const PASSWORD = "V080dataflow!pass";
const EXISTING_EMAILS = ["test@example.com", "drfengling@163.com"];

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

async function until<T>(
  fn: () => Promise<T>,
  ok: (value: T) => boolean,
  label: string,
  timeoutMs = 30_000,
): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`[${label}] 条件未满足，最后一次结果=${JSON.stringify(last)}`);
}

function cnDateString(ms: number = Date.now()): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function registerViaPage(
  page: import("@playwright/test").Page,
  name: string,
  email: string,
  ref?: string,
) {
  await page.goto(ref ? `/register?ref=${ref}` : "/register", {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

test("v0.8.0 数据流：邀请归因 + 连签 7 天额外奖励", async ({ page, context }) => {
  test.setTimeout(900_000);
  loadEnv();

  const baseline = await d1Query(
    "SELECT email, balanceCredits FROM user WHERE email IN (?, ?)",
    EXISTING_EMAILS,
  );
  console.log(`[dataflow] 操作前既有账号余额 ${JSON.stringify(baseline)}`);

  let aId = "";
  let bId = "";
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    const ids = [aId, bId].filter(Boolean);
    if (ids.length) {
      const inClause = ids.map(() => "?").join(", ");
      await d1Query(`DELETE FROM invite_record WHERE inviterId IN (${inClause}) OR inviteeId IN (${inClause})`, [...ids, ...ids]);
      for (const table of ["topup", "temporary_balance", "checkin", "quota", "session", "account", "usage_log"]) {
        await d1Query(`DELETE FROM ${table} WHERE userId IN (${inClause})`, ids);
      }
      await d1Query(`DELETE FROM user WHERE id IN (${inClause})`, ids);
    }
    await d1Query("DELETE FROM registration_log WHERE email IN (?, ?)", [A_EMAIL, B_EMAIL]);
    console.log("[dataflow] 清理完成");
  };

  try {
    // ---------- 1. A 注册，读邀请码 ----------
    await registerViaPage(page, "v080 邀请人", A_EMAIL);
    const [a] = await until(
      () => d1Query("SELECT id, inviteCode, balanceCredits FROM user WHERE email = ?", [A_EMAIL]),
      (rows) => rows.length === 1,
      "A 用户落库",
    );
    aId = a.id as string;
    console.log(`[dataflow] A=${JSON.stringify(a)}`);
    expect(String(a.inviteCode)).toMatch(/^[0-9a-f]{12}$/);
    expect(a.balanceCredits).toBe(2000);

    await page.goto("/invite", { waitUntil: "domcontentloaded", timeout: 240_000 });
    const shownCode = (await page.locator("p.font-mono").first().innerText()).trim();
    expect(shownCode).toBe(a.inviteCode);
    console.log(`[dataflow] 邀请页展示邀请码 ${shownCode}`);

    // ---------- 2. B 走邀请链接注册 ----------
    await context.clearCookies();
    await page.goto(`/register?ref=${shownCode}`, {
      waitUntil: "domcontentloaded",
      timeout: 240_000,
    });
    await expect(page.getByText("已通过邀请链接进入")).toBeVisible();
    await page.locator('input[name="name"]').fill("v080 被邀请人");
    await page.locator('input[name="email"]').fill(B_EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "注册", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 240_000 });

    const inviteState = await until(
      async () => {
        const [aRow] = await d1Query("SELECT balanceCredits FROM user WHERE id = ?", [aId]);
        const [bRow] = await d1Query(
          "SELECT id, invitedBy, balanceCredits FROM user WHERE email = ?",
          [B_EMAIL],
        );
        const records = await d1Query(
          "SELECT inviterReward, inviteeReward FROM invite_record WHERE inviterId = ?",
          [aId],
        );
        return { aBalance: aRow?.balanceCredits, b: bRow, records };
      },
      (s) => s.aBalance === 2300 && s.b?.balanceCredits === 2200 && s.records.length === 1,
      "邀请奖励到账",
    );
    bId = inviteState.b.id as string;
    expect(inviteState.b.invitedBy).toBe(aId);
    expect(inviteState.records[0].inviterReward).toBe(300);
    expect(inviteState.records[0].inviteeReward).toBe(200);
    console.log(`[dataflow] 邀请到账 A=${inviteState.aBalance} B=${inviteState.b.balanceCredits} record=${JSON.stringify(inviteState.records)}`);

    const aType7 = await d1Query(
      "SELECT amount, type, description FROM topup WHERE userId = ? AND type = 7",
      [aId],
    );
    const bType7 = await d1Query(
      "SELECT amount, type, description FROM topup WHERE userId = ? AND type = 7",
      [bId],
    );
    expect(aType7).toHaveLength(1);
    expect(aType7[0].amount).toBe(300);
    expect(String(aType7[0].description)).toContain("邀请");
    expect(bType7).toHaveLength(1);
    expect(bType7[0].amount).toBe(200);
    expect(String(bType7[0].description)).toContain("受邀注册奖励");
    console.log(`[dataflow] type=7 流水 A=${JSON.stringify(aType7)} B=${JSON.stringify(bType7)}`);

    // ---------- 3. 连签：预置前 6 天，再真实签到 ----------
    const today = cnDateString();
    for (let n = 6; n >= 1; n--) {
      await d1Query(
        "INSERT INTO checkin (id, userId, checkinDate, quotaAwarded, createdAt) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), bId, shiftDate(today, -n), 0.05, Date.now()],
      );
    }

    await page.goto("/wallet", { waitUntil: "domcontentloaded", timeout: 240_000 });
    await expect(page.getByText("每日签到", { exact: true })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText("已连续签到 6 天，今天签到可延续")).toBeVisible();

    await page.getByRole("button", { name: "立即签到" }).click();
    await expect(page.getByRole("button", { name: "已签到", exact: true })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText("连签 7 天", { exact: true })).toBeVisible({ timeout: 60_000 });

    const checkinState = await until(
      async () => {
        const rows = await d1Query(
          "SELECT checkinDate, quotaAwarded FROM checkin WHERE userId = ? ORDER BY checkinDate",
          [bId],
        );
        const topup3 = await d1Query(
          "SELECT amount, description FROM topup WHERE userId = ? AND type = 3",
          [bId],
        );
        const temp = await d1Query(
          "SELECT amount, description FROM temporary_balance WHERE userId = ?",
          [bId],
        );
        const [bRow] = await d1Query("SELECT balanceCredits FROM user WHERE id = ?", [bId]);
        return { rows, topup3, temp, bBalance: bRow?.balanceCredits };
      },
      (s) => s.rows.length >= 7 && s.topup3.length === 1 && s.temp.length === 1,
      "签到落库",
    );
    const todayRow = checkinState.rows.find((r) => r.checkinDate === today);
    expect(todayRow).toBeTruthy();
    const awarded = Number(todayRow!.quotaAwarded);
    // 生产签到基础额度 10~100 cr，连签第 7 天额外 +200
    expect(awarded).toBeGreaterThan(209.99);
    expect(awarded).toBeLessThanOrEqual(300.01);
    expect(String(checkinState.topup3[0].description)).toContain("含连签 7 天额外奖励 200.00 cr");
    expect(Number(checkinState.temp[0].amount)).toBe(awarded);
    expect(checkinState.bBalance).toBe(2200);
    console.log(`[dataflow] 签到 ${today} award=${awarded} rows=${checkinState.rows.length} topup3=${JSON.stringify(checkinState.topup3)} temp=${JSON.stringify(checkinState.temp)}`);

    // ---------- 4. 以 A 登录：最近邀请显示打码邮箱与奖励 ----------
    await context.clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.locator('input[name="email"]').fill(A_EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 240_000 });
    await page.goto("/invite", { waitUntil: "domcontentloaded", timeout: 240_000 });
    const recentCard = page.locator("[data-slot='card']", { hasText: "最近邀请" });
    await expect(recentCard.getByText("v***@example.com", { exact: true })).toBeVisible();
    await expect(recentCard.getByText("+300.00 cr", { exact: true })).toBeVisible();
    const inviterNav = (await page.getByText("已邀请").count()) > 0;
    expect(inviterNav).toBeTruthy();
    console.log("[dataflow] A 视角最近邀请：v***@example.com +300.00 cr");

    // ---------- 5. 清理并复验 ----------
    const beforeCleanupIds = [aId, bId];
    await cleanup();

    const inClause = beforeCleanupIds.map(() => "?").join(", ");
    const residue = {
      users: await d1Query(`SELECT COUNT(*) AS n FROM user WHERE email IN (?, ?)`, [A_EMAIL, B_EMAIL]),
      invite: await d1Query(`SELECT COUNT(*) AS n FROM invite_record WHERE inviterId IN (${inClause}) OR inviteeId IN (${inClause})`, [...beforeCleanupIds, ...beforeCleanupIds]),
      topup: await d1Query(`SELECT COUNT(*) AS n FROM topup WHERE userId IN (${inClause})`, beforeCleanupIds),
      checkin: await d1Query(`SELECT COUNT(*) AS n FROM checkin WHERE userId IN (${inClause})`, beforeCleanupIds),
      temp: await d1Query(`SELECT COUNT(*) AS n FROM temporary_balance WHERE userId IN (${inClause})`, beforeCleanupIds),
      quota: await d1Query(`SELECT COUNT(*) AS n FROM quota WHERE userId IN (${inClause})`, beforeCleanupIds),
      regLog: await d1Query(`SELECT COUNT(*) AS n FROM registration_log WHERE email IN (?, ?)`, [A_EMAIL, B_EMAIL]),
    };
    console.log(`[dataflow] 清理后残留 ${JSON.stringify(residue)}`);
    for (const [key, rows] of Object.entries(residue)) {
      expect(Number(rows[0].n), `${key} 残留`).toBe(0);
    }

    const after = await d1Query(
      "SELECT email, balanceCredits FROM user WHERE email IN (?, ?)",
      EXISTING_EMAILS,
    );
    expect(after).toEqual(baseline);
    console.log(`[dataflow] 清理后既有账号余额 ${JSON.stringify(after)}（与操作前一致）`);
  } finally {
    await cleanup();
  }
});

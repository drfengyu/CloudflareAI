import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";

/**
 * v0.9.0 聊天端到端（会写线上 D1，只碰 test@example.com 自己的会话与一把临时 key，跑完清理）：
 * 发送→落库→重新生成→编辑重发→停止生成→markdown 渲染→清理并核对扣费。
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "test@example.com";
const KEY_NAME = "v090-chat-e2e";
const CHEAP_MODEL = "@cf/meta/llama-3.2-1b-instruct";
const MARKDOWN = "## 标题库\n\n- 列表项一\n- 列表项二\n\n```python\nprint(\"hi\")\n```\n\n[示例链接](https://example.com)";

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

async function until<T>(
  fn: () => Promise<T>,
  ok: (value: T) => boolean,
  label: string,
  timeoutMs = 60_000,
): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`[${label}] 条件未满足，最后结果=${JSON.stringify(last)}`);
}

test("v0.9.0 聊天：发送 / 落库 / 重新生成 / 编辑重发 / 停止 / markdown", async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
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

  const balanceBefore = Number(
    (await d1Query("SELECT balanceCredits FROM user WHERE id = ?", [user.id]))[0].balanceCredits,
  );
  let sessionId = "";
  let probeSessionId = "";

  const cleanup = async () => {
    await d1Query("DELETE FROM chat_session WHERE userId = ?", [user.id]);
    await d1Query("DELETE FROM api_key WHERE userId = ? AND name = ?", [user.id, KEY_NAME]);
  };

  try {
    // ---- 0. /api/ai/* 要账号有一把启用 key；直接落库，建 key 不是本用例的验证目标 ----
    await d1Query(
      `INSERT INTO api_key (id, userId, name, prefix, keyHash, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [crypto.randomUUID(), user.id, KEY_NAME, "sk-cfai-e2e", `e2e-${crypto.randomUUID()}`, Date.now()],
    );

    // ---- 1. 首次发送：建会话 + 一问一答落库 ----
    await page.goto("/chat", { waitUntil: "domcontentloaded", timeout: 240_000 });
    await expect(page.getByRole("heading", { name: "AI 对话" })).toBeVisible({ timeout: 240_000 });

    const modelSelect = page.locator("select").first();
    // 优先选最便宜的小模型，避免 e2e 把测试账号余额烧掉
    try {
      await modelSelect.selectOption({ value: CHEAP_MODEL });
    } catch {
      const labels = await modelSelect.locator("option").allTextContents();
      const idx = labels.findIndex((t) => /1b|3\.2/i.test(t));
      if (idx >= 0) await modelSelect.selectOption({ index: idx });
    }
    const chosenModel = await modelSelect.inputValue();
    console.log(`[chat] 使用模型 ${chosenModel}`);

    const composer = page.locator("form textarea").last();
    await composer.fill("用一句话介绍北京。");
    await page.getByRole("button", { name: "发送" }).click();

    // 一轮生成结束的唯一可靠信号：按钮从「停止」换回「发送」。
    // 上一步没等完就点下一步，会因为 streaming 挡掉 runTurn 而静默无反应。
    const sent = page.getByRole("button", { name: "发送" });
    const waitForTurn = async () => {
      await expect(page.getByRole("button", { name: "停止" })).toBeVisible({ timeout: 120_000 });
      await expect(sent).toBeVisible({ timeout: 240_000 });
    };
    await waitForTurn();

    const answer = page.locator(".chat-markdown").last();
    await expect(answer).toBeVisible();
    expect((await answer.innerText()).trim().length).toBeGreaterThan(0);

    const firstTurn = await until(
      async () => {
        const rows = await d1Query(
          `SELECT m.seq, m.role, length(m.content) AS len, s.id AS sessionId
             FROM chat_message m JOIN chat_session s ON s.id = m.sessionId
            WHERE s.userId = ? ORDER BY m.seq`,
          [user.id],
        );
        return rows;
      },
      (rows) => rows.length >= 2,
      "首轮落库",
    );
    sessionId = String(firstTurn[0].sessionId);
    console.log(`[chat] 首轮 ${JSON.stringify(firstTurn)}`);
    expect(firstTurn.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(Number(firstTurn[1].len)).toBeGreaterThan(0);

    // 标题自动取首条消息摘要
    const [sess] = await d1Query("SELECT title FROM chat_session WHERE id = ?", [sessionId]);
    expect(String(sess.title).length).toBeGreaterThan(0);
    expect(String(sess.title)).not.toBe("新对话");
    console.log(`[chat] 自动标题「${sess.title}」`);

    // ---- 2. 刷新回看：消息从库里渲染（限定在消息区，避免撞上左侧会话标题） ----
    await page.goto(`/chat?s=${sessionId}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await expect(
      page.locator(".whitespace-pre-wrap", { hasText: "用一句话介绍北京。" }),
    ).toBeVisible({ timeout: 120_000 });

    // ---- 3. 重新生成：替换旧回答，不重复用户消息 ----
    const before = await d1Query(
      "SELECT id, createdAt FROM chat_message WHERE sessionId = ? AND role='assistant'",
      [sessionId],
    );
    await page.getByRole("button", { name: "重新生成" }).click();
    await waitForTurn();
    const regenerated = await until(
      async () =>
        d1Query("SELECT seq, role, id, createdAt FROM chat_message WHERE sessionId = ? ORDER BY seq", [
          sessionId,
        ]),
      (rows) =>
        rows.length === 2 &&
        String(rows[0].role) === "user" &&
        String(rows[1].role) === "assistant" &&
        String(rows[1].id) !== String(before[0].id),
      "重新生成后应仍是一问一答且换了一条新回答",
    );
    console.log(`[chat] 重新生成 ${JSON.stringify(regenerated.map((r) => [r.seq, r.role]))}`);

    // ---- 4. 编辑重发：从该条用户消息起重建 ----
    await page.getByRole("button", { name: "编辑重发" }).first().click();
    await page.locator("textarea").first().fill("用一句话介绍上海。");
    await page.getByRole("button", { name: "保存并重发" }).click();
    await waitForTurn();
    const edited = await until(
      async () =>
        d1Query("SELECT seq, role, content FROM chat_message WHERE sessionId = ? ORDER BY seq", [
          sessionId,
        ]),
      (rows) =>
        rows.length === 2 &&
        String(rows[0].role) === "user" &&
        String(rows[0].content).includes("介绍上海"),
      "编辑重发后用户消息应被替换",
    );
    console.log(`[chat] 编辑重发后 ${JSON.stringify(edited.map((r) => [r.seq, r.role]))}`);

    // ---- 5. 停止生成：半截回答也要落库，界面回到可输入态 ----
    await page.locator("form textarea").last().fill("请从 1 开始逐个数字念下去，每行一个，不要停：");
    await page.getByRole("button", { name: "发送" }).click();
    const stopBtn = page.getByRole("button", { name: "停止" });
    await expect(stopBtn).toBeVisible({ timeout: 120_000 });
    // 「停止」在首字到达前就已出现，那时 abort 本来没有半截可存；等内容真的开始输出再打断。
    const streamingAnswer = page.locator(".chat-markdown").last();
    await expect
      .poll(async () => (await streamingAnswer.innerText()).trim().length, { timeout: 120_000 })
      .toBeGreaterThan(4);
    await stopBtn.click();
    await expect(page.getByRole("button", { name: "发送" })).toBeVisible({ timeout: 120_000 });

    const stopped = await d1Query(
      "SELECT seq, role, length(content) AS len FROM chat_message WHERE sessionId = ? ORDER BY seq",
      [sessionId],
    );
    console.log(`[chat] 停止生成后 ${JSON.stringify(stopped)}`);
    // 一问一答 × 两轮 + 被中断那轮的半截回答都要留下
    expect(stopped.length).toBe(4);
    expect(String(stopped[3].role)).toBe("assistant");
    expect(Number(stopped[3].len)).toBeGreaterThan(0);
    await expect(page.getByText("内容在生成中被中断")).toBeVisible({ timeout: 60_000 });

    // ---- 6. markdown 渲染用固定内容验证（不依赖模型输出格式） ----
    probeSessionId = crypto.randomUUID();
    const now = Date.now();
    await d1Query(
      `INSERT INTO chat_session (id, userId, title, model, pinned, createdAt, lastMessageAt)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [probeSessionId, user.id, "渲染探针", chosenModel, now, now],
    );
    await d1Query(
      `INSERT INTO chat_message (id, sessionId, seq, role, model, content, creditsUsed, createdAt)
       VALUES (?, ?, 1, 'assistant', ?, ?, 0, ?)`,
      [crypto.randomUUID(), probeSessionId, chosenModel, MARKDOWN, now],
    );
    await page.goto(`/chat?s=${probeSessionId}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await expect(page.getByRole("heading", { name: "标题库" })).toBeVisible({ timeout: 120_000 });
    // listitem 的可访问名不来自内容，只能按文本过滤
    await expect(page.getByRole("listitem").filter({ hasText: "列表项一" })).toBeVisible();
    await expect(page.getByText('print("hi")')).toBeVisible();
    await expect(page.getByRole("link", { name: "示例链接" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    await expect(page.getByRole("button", { name: "复制" })).toBeVisible();
  } finally {
    await cleanup();

    const left = await d1Query(
      `SELECT (SELECT COUNT(*) FROM chat_session WHERE userId = ?) AS sessions,
              (SELECT COUNT(*) FROM chat_message m WHERE m.sessionId IN (SELECT id FROM chat_session WHERE userId = ?)) AS messages,
              (SELECT COUNT(*) FROM api_key WHERE userId = ? AND name = ?) AS keys`,
      [user.id, user.id, user.id, KEY_NAME],
    );
    const balanceAfter = Number(
      (await d1Query("SELECT balanceCredits FROM user WHERE id = ?", [user.id]))[0].balanceCredits,
    );
    const spent = balanceBefore - balanceAfter;
    console.log(`[chat] 清理后残留 ${JSON.stringify(left[0])}`);
    console.log(`[chat] 扣费 ${spent.toFixed(4)} cr（${balanceBefore} → ${balanceAfter}）`);
    for (const [k, v] of Object.entries(left[0] as Record<string, unknown>)) {
      expect(Number(v), `${k} 残留`).toBe(0);
    }
    // 三问三答走最便宜的小模型，正常不到 5 cr；上限留到 40 cr，
    // 只为兜住「同一个请求被重复计费」这类真 bug，而不是模型话多话少。
    expect(spent).toBeLessThan(40);
  }
});

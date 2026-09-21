import { test, expect } from "@playwright/test";

/**
 * 验证流式 token 计费修复。
 *
 * 流程：
 * 1. 登录 → playground 文本生成（已登录的话会自动跳过）
 * 2. 输入 prompt（用 placeholder="输入消息..." 的 input）
 * 3. 抓取 SSE 流末尾的 usage chunk（应该包含真实 token 数）
 * 4. 验证 status=200 + usage chunk 存在
 *
 * 运行：
 *   npx playwright test tests/e2e/streaming-metering.spec.ts --headed --project=chromium
 */

const PROD_URL = "https://cloudai.fuwari.fun";

test.describe("流式计量真实 token 验证", () => {
  test.use({ baseURL: PROD_URL });
  test.setTimeout(5 * 60 * 1000);

  test("playground 流式调用应返回带 usage 的 SSE", async ({ page }) => {
    // ===== 1. 直接打开 playground 文本（已登录会留在该页，未登录跳到 /login）=====
    await page.goto("/playground/text");
    // 如果跳到了登录页，等用户手动登录
    if (page.url().includes("/login")) {
      console.log("\n👉 请用任意方式登录...\n");
      await page.waitForURL(/\/playground|\/dashboard|\/$/, { timeout: 4 * 60 * 1000 });
      console.log("✅ 登录成功");
      // 再次跳到文本 playground（防止登录后跳 dashboard）
      if (!page.url().includes("/playground/text")) {
        await page.goto("/playground/text");
      }
    }
    await page.waitForLoadState("networkidle");
    console.log("📍 已打开文本 playground");

    // ===== 2. 等输入框出现 =====
    const promptInput = page.getByPlaceholder("输入消息...");
    await expect(promptInput).toBeVisible({ timeout: 15000 });

    // ===== 3. 准备拦截 /api/ai/text 的 SSE 响应 =====
    let sseBody = "";
    let respStatus = 0;
    const sseResponsePromise = page
      .waitForResponse((resp) => resp.url().includes("/api/ai/text"), {
        timeout: 60000,
      })
      .then(async (resp) => {
        respStatus = resp.status();
        sseBody = await resp.text();
      });

    // ===== 4. 输入 prompt + 提交表单（Enter 键，按钮是图标）=====
    await promptInput.fill("Count from 1 to 5 in English.");
    await promptInput.press("Enter");
    console.log("🚀 已发起流式请求，等待响应...");

    await sseResponsePromise;
    console.log(`\n=== /api/ai/text 响应 ===`);
    console.log(`Status: ${respStatus}`);
    console.log(`Body length: ${sseBody.length}`);

    expect(respStatus).toBe(200);

    // ===== 5. 在 SSE body 中找 usage chunk =====
    // SSE 格式：data: {"usage":{"prompt_tokens":N,"completion_tokens":M,...}}
    const usageMatches = sseBody.match(/"usage":\s*\{[^}]+\}/g);
    console.log(`📊 SSE body 中的 usage chunk 数量: ${usageMatches?.length ?? 0}`);

    expect(usageMatches).not.toBeNull();
    expect(usageMatches!.length).toBeGreaterThan(0);

    // 解析最后一个 usage
    const lastUsageJson = usageMatches![usageMatches!.length - 1];
    const usageObj = JSON.parse(`{${lastUsageJson}}`);
    const promptTokens = usageObj.usage.prompt_tokens;
    const completionTokens = usageObj.usage.completion_tokens;
    console.log(`💡 末尾 usage: prompt_tokens=${promptTokens}, completion_tokens=${completionTokens}`);

    // 验证：completion_tokens 应该是个合理的小数（5-50 之间，不是默认 max_tokens 2048）
    expect(completionTokens).toBeGreaterThan(0);
    expect(completionTokens).toBeLessThan(500); // "Count 1 to 5" 不应超 500 tokens

    // 验证：input 也必须收到钱。Cloudflare 在后续 chunk 里把 prompt_tokens 清零，
    // 计量若取最后一个 chunk 就会记 0 —— 这里用整段 SSE 的峰值而不是末尾值。
    const peakPrompt = Math.max(
      ...usageMatches!.map((m) => JSON.parse(`{${m}}`).usage.prompt_tokens ?? 0),
    );
    const peakCompletion = Math.max(
      ...usageMatches!.map(
        (m) => JSON.parse(`{${m}}`).usage.completion_tokens ?? 0,
      ),
    );
    console.log(`💡 峰值 usage: prompt_tokens=${peakPrompt}, completion_tokens=${peakCompletion}`);
    // prompt 至少覆盖 system prompt + 这句 user 消息
    expect(peakPrompt).toBeGreaterThan(10);
    expect(peakCompletion).toBeGreaterThan(0);

    // 验证：这次调用在网关侧会被判定为「拿到终态 usage」（`usageFinal`）——即流以
    // [DONE] 收尾，且真实计数落在**最后**一个 usage 块上（Cloudflare 的真值只在
    // finish_reason 之后的 `choices: []` 尾块，中间块全是 `{0,1}` 占位桩）。
    // 只有满足这两条的流才按完整 usage 计费；不满足的（客户端断开 / 上游 reset /
    // 停顿）只按 provider 已数清的 input 计费、output 记 0 并标 `stream_truncated`，
    // 一个 usage 块都没有的记 `usage_unavailable` error 行。所以这里必须确认
    // 「完成流 = 末尾即峰值」这条前提成立，否则真实计费会被误判成截断。
    expect(sseBody).toContain("[DONE]");
    expect(completionTokens).toBe(peakCompletion);
    expect(promptTokens).toBe(peakPrompt);

    // ===== 6. 等 logUsage 后台写入数据库 =====
    await page.waitForTimeout(3000);
    console.log(`\n✅ SSE 解析成功，usage 真实可拿。预期 logUsage 会记 outputTokens=${completionTokens}`);
  });
});


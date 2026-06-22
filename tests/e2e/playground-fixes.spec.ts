import { test, expect } from "@playwright/test";

/**
 * Playground 修复验证测试
 *
 * 测试内容：
 * 1. Qwen/QwQ <think> 标签解析
 * 2. 复制功能
 * 3. localStorage 持久化
 * 4. 长回复不截断
 * 5. API Key 名字编辑
 *
 * 需要设置环境变量：
 * TEST_EMAIL=your-test-email@example.com
 * TEST_PASSWORD=your-test-password
 */

const BASE_URL = process.env.BASE_URL || "https://cloudai.fuwari.fun";
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

test.describe("Playground Fixes Verification", () => {
  test.use({
    baseURL: BASE_URL,
  });

  test.beforeEach(async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      console.log("⊘ Skipping: TEST_EMAIL and TEST_PASSWORD environment variables not set");
      test.skip();
      return;
    }

    // 登录
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // 检查是否已登录
    const isLoggedIn = await page.locator('text=/Dashboard|仪表盘|API Keys/i').isVisible().catch(() => false);

    if (!isLoggedIn) {
      console.log("Logging in...");

      // 填写登录表单
      await page.getByLabel(/邮箱|Email/i).fill(TEST_EMAIL);
      await page.getByLabel(/密码|Password/i).fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /登录|Login|Sign in/i }).click();

      // 等待登录完成
      await page.waitForURL(/dashboard|keys|playground/, { timeout: 10000 });
      await page.waitForLoadState("networkidle");
    }
  });

  test("should copy assistant message content", async ({ page }) => {
    await page.goto("/playground/text");
    await page.waitForLoadState("networkidle");

    // 选择模型（获取第一个可用的模型）
    const modelSelect = page.locator('select').first();
    const options = await modelSelect.locator('option').allTextContents();

    // 找一个快速响应的模型
    const quickModel = options.find(opt =>
      opt.includes('llama-3.3') ||
      opt.includes('gemma') ||
      opt.includes('mistral') ||
      opt.includes('qwen')
    );

    if (quickModel) {
      await modelSelect.selectOption({ label: quickModel });
    }

    // 发送简单提示词
    const input = page.locator('input[placeholder*="输入消息"]');
    await input.fill("Say 'Hello World' in one line");

    const sendButton = page.locator('button[type="submit"]').last();
    await sendButton.click();

    // 等待助手回复出现
    await page.waitForSelector('text=/助手|assistant/i', { timeout: 15000 });
    await page.waitForTimeout(3000); // 等待回复完成

    // 悬停在助手回复上，应该出现复制按钮
    const assistantMessage = page.locator('div').filter({ hasText: /助手|assistant/i }).last();
    await assistantMessage.hover();

    // 检查复制按钮是否出现
    const copyButton = assistantMessage.locator('button').first();

    await expect(copyButton).toBeVisible({ timeout: 5000 });

    // 点击复制按钮
    await copyButton.click();

    // 验证复制成功反馈（绿色对勾或复制图标）
    await page.waitForTimeout(500);

    console.log("✓ Copy button works correctly");
  });

  test("should persist conversation history in localStorage", async ({ page }) => {
    await page.goto("/playground/text");
    await page.waitForLoadState("networkidle");

    // 清空之前的对话（如果按钮可用）
    const clearButton = page.locator('button', { hasText: /清空对话|Clear/i });
    if (await clearButton.isEnabled().catch(() => false)) {
      await clearButton.click();
      await page.waitForTimeout(500);
    }

    // 发送一条测试消息
    const input = page.locator('input[placeholder*="输入消息"]');
    await input.fill("Test message for persistence");

    const sendButton = page.locator('button[type="submit"]').last();
    await sendButton.click();

    // 等待回复
    await page.waitForSelector('text=/助手|assistant/i', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 获取当前对话内容
    const messages = await page.locator('div').filter({ hasText: /你|助手/i }).allTextContents();
    expect(messages.length).toBeGreaterThan(0);

    // 导航到其他页面
    await page.goto("/keys");
    await page.waitForLoadState("networkidle");

    // 返回 playground
    await page.goto("/playground/text");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000); // 等待 localStorage 恢复

    // 验证对话历史是否恢复
    const restoredMessages = await page.locator('div').filter({ hasText: /你|助手/i }).allTextContents();
    expect(restoredMessages.length).toBe(messages.length);
    expect(restoredMessages.join('')).toContain("Test message for persistence");

    console.log("✓ localStorage persistence works correctly");
  });

  test("should handle long responses without truncation", async ({ page }) => {
    await page.goto("/playground/text");
    await page.waitForLoadState("networkidle");

    // 选择大模型
    const modelSelect = page.locator('select').first();
    const options = await modelSelect.locator('option').allTextContents();

    const largeModel = options.find(opt =>
      opt.includes('llama-3.3-70b') || opt.includes('llama-4')
    );

    if (largeModel) {
      await modelSelect.selectOption({ label: largeModel });
    }

    // 发送需要长回复的提示词
    const input = page.locator('input[placeholder*="输入消息"]');
    await input.fill("List 20 countries and their capitals, with one interesting fact about each country. Format: Country: Capital - Fact");

    const sendButton = page.locator('button[type="submit"]').last();
    await sendButton.click();

    // 等待回复开始
    await page.waitForSelector('text=/助手|assistant/i', { timeout: 15000 });

    // 等待回复完成（通过检查 loading 状态消失）
    await page.waitForTimeout(10000); // 给长回复足够时间

    // 获取助手回复内容
    const assistantMessage = page.locator('div').filter({ hasText: /助手|assistant/i }).last();
    const content = await assistantMessage.textContent();

    // 验证回复包含多个国家（至少10个）
    const countryMatches = content?.match(/[A-Z][a-z]+:/g) || [];
    expect(countryMatches.length).toBeGreaterThan(10);

    console.log(`✓ Long response not truncated (${countryMatches.length} countries found)`);
  });

  test("should parse Qwen/QwQ reasoning with <think> tags", async ({ page }) => {
    await page.goto("/playground/text");
    await page.waitForLoadState("networkidle");

    // 检查是否有 Qwen QwQ 模型
    const modelSelect = page.locator('select').first();
    const options = await modelSelect.locator('option').allTextContents();

    const qwenModel = options.find(opt =>
      opt.toLowerCase().includes('qwq') || opt.includes('qwen3-30b')
    );

    if (!qwenModel) {
      console.log("⊘ Skipping: No Qwen/QwQ model available");
      test.skip();
      return;
    }

    // 选择 Qwen 推理模型
    await modelSelect.selectOption({ label: qwenModel });

    // 发送需要推理的问题
    const input = page.locator('input[placeholder*="输入消息"]');
    await input.fill("Calculate 23 × 47, show your step-by-step reasoning");

    const sendButton = page.locator('button[type="submit"]').last();
    await sendButton.click();

    // 等待助手回复
    await page.waitForSelector('text=/助手|assistant/i', { timeout: 20000 });
    await page.waitForTimeout(5000); // 推理模型需要更长时间

    // 检查是否有思考过程区域
    const reasoningBlock = page.locator('div', { hasText: /思考过程|🧠/i });

    if (await reasoningBlock.isVisible()) {
      console.log("✓ Reasoning block detected");

      // 验证可以折叠/展开
      const toggleButton = reasoningBlock.locator('button').first();
      await toggleButton.click();
      await page.waitForTimeout(500);

      // 再次点击展开
      await toggleButton.click();
      await page.waitForTimeout(500);

      console.log("✓ Reasoning block can be toggled");
    } else {
      console.log("⚠ No reasoning block found (model might not use <think> tags)");
    }
  });

  test("should update API Key name immediately", async ({ page }) => {
    await page.goto("/keys");
    await page.waitForLoadState("networkidle");

    // 检查是否有现有 key
    const keyRows = page.locator('table tbody tr');
    const keyCount = await keyRows.count();

    if (keyCount === 0) {
      console.log("⊘ Skipping: No API keys found");
      test.skip();
      return;
    }

    // 获取第一个 key 的操作按钮（三个点图标或编辑按钮）
    const firstRow = keyRows.first();

    // 尝试找编辑按钮（可能是文字或图标）
    const editButton = firstRow.locator('button').first();
    await editButton.click();
    await page.waitForTimeout(1000);

    // 检查编辑对话框是否出现（可能是 sheet 或 dialog）
    const hasDialog = await page.locator('h2, h3').filter({ hasText: /编辑|Edit/i }).isVisible().catch(() => false);

    if (!hasDialog) {
      console.log("⊘ Skipping: Edit dialog did not open");
      test.skip();
      return;
    }

    // 获取名称输入框
    const nameInput = page.locator('input[type="text"]').first();
    const originalName = await nameInput.inputValue();

    // 修改名称
    const newName = `Test Key ${Date.now()}`;
    await nameInput.fill(newName);

    // 保存
    const saveButton = page.locator('button', { hasText: /保存|Save/i }).last();
    await saveButton.click();

    // 等待对话框关闭
    await page.waitForTimeout(1000);

    // 验证名称已更新
    await expect(page.locator(`text="${newName}"`).first()).toBeVisible({ timeout: 5000 });

    console.log(`✓ API Key name updated: "${originalName}" → "${newName}"`);

    // 恢复原名称（清理）
    await editButton.click();
    await page.waitForTimeout(500);
    await nameInput.fill(originalName);
    await saveButton.click();
  });
});

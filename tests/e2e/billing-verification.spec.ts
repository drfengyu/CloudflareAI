import { test, expect } from '@playwright/test';

/**
 * 计费验证测试
 * 测试目标：
 * 1. 登录测试账户
 * 2. 测试文本模型调用（验证基础倍率生效）
 * 3. 测试图像模型调用（验证固定价格）
 * 4. 验证 token 显示
 * 5. 验证历史记录
 */

const TEST_EMAIL = 'test@example.com'; // 需要确认实际测试账户邮箱
const TEST_PASSWORD = 'test123456';

test.describe('Billing Verification', () => {
  test.beforeEach(async ({ page }) => {
    // 登录测试账户
    await page.goto('http://localhost:3000/auth/signin');

    // 等待登录表单加载
    await page.waitForSelector('input[type="email"]');

    // 填写邮箱密码
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);

    // 点击登录
    await page.click('button[type="submit"]');

    // 等待跳转到 dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('应该显示 Dashboard 统计数据', async ({ page }) => {
    // 验证核心指标卡片
    await expect(page.locator('text=当前余额')).toBeVisible();
    await expect(page.locator('text=今日消耗')).toBeVisible();
    await expect(page.locator('text=今日调用')).toBeVisible();
    await expect(page.locator('text=本月调用')).toBeVisible();

    // 验证 token 统计显示
    const todayCard = page.locator('text=今日调用').locator('..');
    await expect(todayCard.locator('text=/输入.*输出/')).toBeVisible();
  });

  test('测试文本模型调用（验证基础倍率）', async ({ page }) => {
    // 导航到文本 playground
    await page.goto('http://localhost:3000/playground/text');

    // 等待页面加载
    await page.waitForSelector('select', { timeout: 5000 });

    // 选择文本模型（textSmall）
    await page.selectOption('select', '@cf/meta/llama-3.1-8b-instruct');

    // 记录调用前余额
    await page.goto('http://localhost:3000/dashboard');
    const balanceBefore = await page.locator('text=当前余额').locator('..').textContent();
    console.log('调用前余额:', balanceBefore);

    // 回到 playground
    await page.goto('http://localhost:3000/playground/text');

    // 输入测试消息
    const input = page.getByPlaceholder('输入消息...');
    await input.fill('Hello, this is a test message. Count to 3.');

    // 点击发送
    await page.click('button:has-text("发送")');

    // 等待响应完成（等待停止按钮消失）
    await page.waitForSelector('button:has-text("停止")', { state: 'hidden', timeout: 30000 });

    // 等待 2 秒确保计费完成
    await page.waitForTimeout(2000);

    // 检查历史记录
    await page.goto('http://localhost:3000/history');

    // 验证最新记录
    const latestRecord = page.locator('[class*="grid"][class*="rounded-lg"]').first();

    // 验证状态为 ok
    await expect(latestRecord.locator('text=ok')).toBeVisible();

    // 验证显示 token 数量（格式：X / Y）
    await expect(latestRecord.locator('text=/\\d+ \\/ \\d+/')).toBeVisible();

    // 验证显示 credits 消耗
    const creditsText = await latestRecord.locator('[class*="font-medium"]').textContent();
    console.log('文本模型消耗:', creditsText);

    // 提取 credits 数值
    const creditsMatch = creditsText?.match(/([\d.]+) cr/);
    if (creditsMatch) {
      const credits = parseFloat(creditsMatch[1]);
      console.log('提取的 credits 值:', credits);

      // 验证消耗合理（假设基础倍率=1000，应该在 0.01-1 cr 之间）
      expect(credits).toBeGreaterThan(0);
      expect(credits).toBeLessThan(10); // 短消息不应该超过 10 cr
    }
  });

  test('测试图像模型调用（验证固定价格）', async ({ page }) => {
    // 导航到图像 playground
    await page.goto('http://localhost:3000/playground/image');

    // 等待页面加载
    await page.waitForSelector('select', { timeout: 5000 });

    // 选择图像模型
    await page.selectOption('select', '@cf/black-forest-labs/flux-1-schnell');

    // 输入 prompt
    const promptInput = page.getByPlaceholder(/prompt|描述/i);
    await promptInput.fill('A beautiful sunset over mountains');

    // 点击生成
    await page.click('button:has-text("生成")');

    // 等待图片生成完成（最多 60 秒）
    await page.waitForSelector('img[alt*="Generated"]', { timeout: 60000 });

    // 等待 2 秒确保计费完成
    await page.waitForTimeout(2000);

    // 检查历史记录
    await page.goto('http://localhost:3000/history');

    // 验证最新记录
    const latestRecord = page.locator('[class*="grid"][class*="rounded-lg"]').first();

    // 验证任务类型
    await expect(latestRecord.locator('text=/Text-to-Image|图像/')).toBeVisible();

    // 验证消耗
    const creditsText = await latestRecord.locator('[class*="font-medium"]').textContent();
    console.log('图像模型消耗:', creditsText);

    // 提取 credits 数值
    const creditsMatch = creditsText?.match(/([\d,]+) cr/);
    if (creditsMatch) {
      const credits = parseFloat(creditsMatch[1].replace(/,/g, ''));
      console.log('提取的图像 credits 值:', credits);

      // 验证固定价格（应该在 3000-4000 cr）
      expect(credits).toBeGreaterThanOrEqual(3000);
      expect(credits).toBeLessThanOrEqual(4000);
    }
  });

  test('验证历史记录显示完整', async ({ page }) => {
    // 导航到历史记录页面
    await page.goto('http://localhost:3000/history');

    // 验证页面标题
    await expect(page.locator('h1, h2').filter({ hasText: '使用历史' })).toBeVisible();

    // 检查是否有记录
    const records = page.locator('[class*="grid"][class*="rounded-lg"]');
    const count = await records.count();

    if (count > 0) {
      const firstRecord = records.first();

      // 验证状态标签存在
      await expect(firstRecord.locator('text=/ok|error/')).toBeVisible();

      // 验证模型名称存在
      await expect(firstRecord.locator('[class*="font-mono"]')).toBeVisible();

      // 验证 token 列存在（格式：X / Y 或 —）
      const tokenText = await firstRecord.locator('[title="输入 / 输出 tokens"]').textContent();
      console.log('Token 显示:', tokenText);

      // 验证 credits 列存在
      await expect(firstRecord.locator('text=/\\d+ cr|—/')).toBeVisible();

      // 验证延迟列存在
      await expect(firstRecord.locator('text=/\\d+\\.\\d+s|—/')).toBeVisible();

      // 验证时间列存在
      await expect(firstRecord.locator('text=/\\d{4}/')).toBeVisible();
    }
  });

  test('验证 Dashboard token 统计', async ({ page }) => {
    // 导航到 Dashboard
    await page.goto('http://localhost:3000/dashboard');

    // 验证今日调用卡片有 token 统计
    const todayCard = page.locator('text=今日调用').locator('..');
    const tokenStats = await todayCard.locator('text=/输入.*\\d+.*输出.*\\d+/').textContent();
    console.log('今日 token 统计:', tokenStats);

    // 验证本月调用卡片有 token 统计
    const monthCard = page.locator('text=本月调用').locator('..');
    const monthTokenStats = await monthCard.locator('text=/输入.*\\d+.*输出.*\\d+/').textContent();
    console.log('本月 token 统计:', monthTokenStats);

    // 验证最近调用列表显示 token
    const recentCalls = page.locator('text=最近 10 次调用').locator('..');
    const records = recentCalls.locator('[class*="grid"][class*="rounded-lg"]');

    if (await records.count() > 0) {
      // 检查第一条记录
      const firstRecord = records.first();
      await expect(firstRecord.locator('text=/\\d+ \\/ \\d+|—/')).toBeVisible();
    }
  });

  test('验证管理后台用户余额显示', async ({ page }) => {
    // 导航到用户管理（需要管理员权限）
    await page.goto('http://localhost:3000/admin/users');

    // 如果没有权限会重定向到 dashboard
    const url = page.url();

    if (url.includes('/admin/users')) {
      // 有管理员权限，验证余额显示
      const userRows = page.locator('[class*="table"] tr, [role="row"]');

      if (await userRows.count() > 1) {
        // 验证余额列存在（格式：X cr / ≈ $Y）
        await expect(page.locator('text=/\\d+ cr/')).toBeVisible();
        await expect(page.locator('text=/≈ \\$\\d+/')).toBeVisible();

        console.log('管理后台余额显示正常');
      }
    } else {
      console.log('当前账户无管理员权限，跳过管理后台测试');
    }
  });
});

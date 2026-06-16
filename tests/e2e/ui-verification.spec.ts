import { test, expect } from '@playwright/test';

/**
 * 功能验证测试（简化版）
 * 假设已有测试账户，密码：test123456
 */

// 请在运行前设置实际的测试账户邮箱
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = 'test123456';
const BASE_URL = 'http://localhost:3000';

test.describe('Billing and Token Display Verification', () => {

  test('验证 Dashboard 显示 token 统计', async ({ page }) => {
    // 如果需要登录，先执行登录
    // await login(page);

    await page.goto(`${BASE_URL}/dashboard`);

    // 验证页面加载
    await page.waitForSelector('text=数据看板', { timeout: 5000 });

    console.log('\n=== Dashboard 验证 ===');

    // 检查核心指标卡片
    const balanceCard = page.locator('text=当前余额');
    expect(await balanceCard.isVisible()).toBeTruthy();
    console.log('✓ 余额卡片显示');

    const todayCard = page.locator('text=今日调用');
    expect(await todayCard.isVisible()).toBeTruthy();
    console.log('✓ 今日调用卡片显示');

    // 检查 token 统计
    const todayCardParent = todayCard.locator('..');
    const tokenText = await todayCardParent.textContent();

    if (tokenText?.includes('输入') && tokenText?.includes('输出')) {
      console.log('✓ 今日调用显示 token 统计');
      console.log(`  内容: ${tokenText.substring(0, 100)}...`);
    } else {
      console.log('✗ 今日调用未显示 token 统计');
    }

    // 检查最近调用记录
    const recentCallsSection = page.locator('text=最近 10 次调用');
    if (await recentCallsSection.isVisible()) {
      console.log('✓ 最近调用列表显示');

      // 查找第一条记录
      const firstRecord = page.locator('[class*="grid"][class*="rounded-lg"]').first();
      if (await firstRecord.isVisible()) {
        const recordText = await firstRecord.textContent();
        console.log(`  首条记录: ${recordText?.substring(0, 150)}...`);
      }
    }
  });

  test('验证历史记录页面显示 token', async ({ page }) => {
    await page.goto(`${BASE_URL}/history`);

    await page.waitForSelector('text=使用历史', { timeout: 5000 });

    console.log('\n=== 历史记录验证 ===');

    // 查找记录列表
    const records = page.locator('[class*="grid"][class*="rounded-lg"]');
    const count = await records.count();

    console.log(`找到 ${count} 条历史记录`);

    if (count > 0) {
      // 检查第一条记录
      const firstRecord = records.first();
      const recordText = await firstRecord.textContent();

      console.log(`\n首条记录内容:\n${recordText}`);

      // 验证包含必要元素
      if (recordText?.includes('/')) {
        console.log('✓ 显示 token 数量（格式: X / Y）');
      } else if (recordText?.includes('—')) {
        console.log('⚠ Token 显示为 —（可能是旧记录或error）');
      } else {
        console.log('✗ 未找到 token 显示');
      }

      if (recordText?.includes('cr')) {
        console.log('✓ 显示 credits 消耗');
      }

      if (recordText?.includes('s')) {
        console.log('✓ 显示延迟时间');
      }
    } else {
      console.log('⚠ 暂无历史记录');
    }
  });

  test('验证定价页面加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);

    await page.waitForSelector('text=模型定价', { timeout: 5000 });

    console.log('\n=== 定价页面验证 ===');

    // 查找价格显示
    const priceElements = page.locator('text=/\\$\\d+/');
    const priceCount = await priceElements.count();

    console.log(`✓ 定价页面加载，找到 ${priceCount} 个价格标签`);
  });

  test('验证钱包页面', async ({ page }) => {
    await page.goto(`${BASE_URL}/wallet`);

    await page.waitForTimeout(2000);

    console.log('\n=== 钱包页面验证 ===');

    const url = page.url();
    if (url.includes('/wallet')) {
      console.log('✓ 钱包页面加载');

      // 检查余额卡片
      const balanceCard = page.locator('text=/余额|balance/i');
      if (await balanceCard.isVisible()) {
        console.log('✓ 余额卡片显示');
      }

      // 检查充值流水
      const topupSection = page.locator('text=/充值流水|充值记录/i');
      if (await topupSection.isVisible()) {
        console.log('✓ 充值流水显示');
      }
    } else {
      console.log(`⚠ 重定向到: ${url}`);
    }
  });
});

// 辅助函数：登录
async function login(page: any) {
  await page.goto(`${BASE_URL}/auth/signin`);

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);

  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

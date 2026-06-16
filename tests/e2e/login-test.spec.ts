import { test, expect } from '@playwright/test';

/**
 * 登录测试 - 确认测试账户
 */

test.describe('Login Test', () => {
  test('尝试登录测试账户', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/signin');

    // 等待登录表单加载
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // 尝试常见测试账户
    const testAccounts = [
      { email: 'test@example.com', password: 'test123456' },
      { email: 'admin@test.com', password: 'test123456' },
      { email: 'user@test.com', password: 'test123456' },
    ];

    for (const account of testAccounts) {
      console.log(`\n尝试登录: ${account.email}`);

      // 填写表单
      await page.fill('input[type="email"]', account.email);
      await page.fill('input[type="password"]', account.password);

      // 点击登录
      await page.click('button[type="submit"]');

      // 等待 3 秒看结果
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      console.log(`登录后 URL: ${currentUrl}`);

      if (currentUrl.includes('/dashboard')) {
        console.log(`✅ 成功登录: ${account.email}`);

        // 获取用户信息
        await page.goto('http://localhost:3000/settings');
        await page.waitForTimeout(1000);

        const pageContent = await page.content();
        console.log('设置页面已加载');

        return; // 找到有效账户，退出
      } else {
        console.log(`❌ 登录失败: ${account.email}`);
        // 重新加载登录页面
        await page.goto('http://localhost:3000/auth/signin');
        await page.waitForSelector('input[type="email"]');
      }
    }

    // 如果都失败了，尝试注册新账户
    console.log('\n所有测试账户登录失败，尝试注册新账户...');
    await page.goto('http://localhost:3000/auth/signin');

    // 查找注册链接
    const signupLink = page.locator('a[href*="signup"]');
    if (await signupLink.count() > 0) {
      await signupLink.click();
      await page.waitForTimeout(1000);

      // 填写注册表单
      await page.fill('input[type="email"]', 'playwright-test@example.com');
      await page.fill('input[type="password"]', 'test123456');
      await page.fill('input[name="name"]', 'Playwright Test User');

      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      if (currentUrl.includes('/dashboard')) {
        console.log('✅ 成功注册并登录新账户');
      }
    }
  });
});

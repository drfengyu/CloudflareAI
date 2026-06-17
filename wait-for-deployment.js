#!/usr/bin/env node

/**
 * 监控 Vercel 部署并自动测试
 */

const BASE_URL = process.env.BASE_URL || 'https://cloudai.fuwari.fun';
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.error('❌ 请设置 API_KEY 环境变量: export API_KEY="sk-cfai-..."');
  process.exit(1);
}

async function testDeployment() {
  console.log('🚀 正在测试部署状态...\n');

  try {
    const response = await fetch(`${BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: '@cf/google/gemma-4-26b-a4b-it',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "OK"' }]
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ 部署成功！Anthropic API 正常工作\n');
      console.log(`回复: ${data.content?.[0]?.text || ''}`);
      console.log(`用量: ${data.usage?.input_tokens || 0} 输入 + ${data.usage?.output_tokens || 0} 输出\n`);
      return true;
    } else if (response.status === 401) {
      console.log('⏳ 部署尚未完成（仍返回 401）...');
      return false;
    } else {
      const error = await response.text();
      console.log(`⚠️  意外错误 (${response.status}): ${error}`);
      return false;
    }
  } catch (error) {
    console.log('❌ 请求失败:', error.message);
    return false;
  }
}

async function waitForDeployment() {
  const maxAttempts = 20;
  const interval = 15000; // 15 秒

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          等待 Vercel 部署完成并验证修复                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`检查间隔: ${interval / 1000} 秒`);
  console.log(`最大尝试: ${maxAttempts} 次\n`);

  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`[${i}/${maxAttempts}] 检查时间: ${new Date().toLocaleTimeString()}`);
    
    const success = await testDeployment();
    
    if (success) {
      console.log('\n🎉 验证完成！所有测试通过。');
      console.log('\n现在可以运行完整测试套件：');
      console.log('  node test-api-client.js\n');
      return;
    }

    if (i < maxAttempts) {
      console.log(`等待 ${interval / 1000} 秒后重试...\n`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.log('\n⏰ 超时：部署可能需要更长时间');
  console.log('   你可以稍后手动运行测试：');
  console.log('   node test-anthropic-fix.js\n');
}

waitForDeployment();

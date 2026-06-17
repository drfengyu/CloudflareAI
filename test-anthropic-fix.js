#!/usr/bin/env node

/**
 * 快速测试 Anthropic API 认证修复
 */

const BASE_URL = 'https://cloudai.fuwari.fun';
const API_KEY = process.env.API_KEY || 'sk-cfai-5YbdQtmleCXkDrt1qM-yK2rtvbGia-DA';

async function testAnthropicAuth() {
  console.log('🔍 测试 Anthropic Messages API 认证\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 12)}...${API_KEY.substring(API_KEY.length - 4)}\n`);

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
        messages: [
          { role: 'user', content: 'Say "OK" and nothing else.' }
        ]
      }),
    });

    console.log(`HTTP Status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      const usage = data.usage;

      console.log('✅ 成功！Anthropic API 认证通过\n');
      console.log(`回复: ${content}`);
      console.log(`用量: ${usage?.input_tokens || 0} 输入 + ${usage?.output_tokens || 0} 输出\n`);
      
      return true;
    } else {
      const error = await response.text();
      console.log('❌ 失败！\n');
      console.log(`错误响应: ${error}\n`);
      
      if (response.status === 401) {
        console.log('💡 提示: 这可能是因为代码修改还未部署到生产环境');
        console.log('   请确认以下步骤：');
        console.log('   1. git add app/v1/messages/route.ts');
        console.log('   2. git commit -m "fix: Anthropic API x-api-key authentication"');
        console.log('   3. git push');
        console.log('   4. 等待 Vercel 自动部署完成\n');
      }
      
      return false;
    }
  } catch (error) {
    console.log('❌ 请求失败\n');
    console.error(error);
    return false;
  }
}

testAnthropicAuth().then(success => {
  process.exit(success ? 0 : 1);
});

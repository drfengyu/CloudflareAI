#!/usr/bin/env node

/**
 * Cloudflare AI Console API 客户端测试脚本
 * 测试 OpenAI 和 Anthropic 兼容端点
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.error('❌ 错误: 请设置 API_KEY 环境变量');
  console.log('\n使用方法:');
  console.log('  export API_KEY="your-api-key-here"');
  console.log('  node test-api-client.js\n');
  process.exit(1);
}

// 辅助函数：发送 HTTP 请求
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok && !options.expectError) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response;
}

// 测试 1: 列出模型（公开端点）
async function testListModels() {
  console.log('\n📋 测试 1: 列出可用模型 (公开端点)');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/models');
    const data = await response.json();
    
    console.log(`✅ 成功: 获取到 ${data.data?.length || 0} 个模型`);
    if (data.data && data.data.length > 0) {
      console.log(`\n前 5 个模型:`);
      data.data.slice(0, 5).forEach((model, i) => {
        console.log(`  ${i + 1}. ${model.id}`);
      });
    }
    return true;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}`);
    return false;
  }
}

// 测试 2: OpenAI 聊天补全（非流式）
async function testOpenAIChatCompletion() {
  console.log('\n💬 测试 2: OpenAI 聊天补全 (非流式)');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: '@cf/google/gemma-4-26b-a4b-it',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Hello from CloudflareAI!" and nothing else.' }
        ],
        temperature: 0.7,
        max_tokens: 50
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage;

    console.log(`✅ 成功:`);
    console.log(`  回复: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    console.log(`  用量: ${usage?.prompt_tokens || 0} 输入 + ${usage?.completion_tokens || 0} 输出 = ${usage?.total_tokens || 0} tokens`);
    return true;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}`);
    return false;
  }
}

// 测试 3: OpenAI 聊天补全（流式）
async function testOpenAIChatStream() {
  console.log('\n🌊 测试 3: OpenAI 流式聊天');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: '@cf/google/gemma-4-26b-a4b-it',
        messages: [
          { role: 'user', content: 'Count from 1 to 5, each number on a new line.' }
        ],
        stream: true,
        max_tokens: 50
      }),
    });

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    console.log('  流式输出: ', '');
    process.stdout.write('  ');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace(/^data:\s*/, '');
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            process.stdout.write(content);
          }
        } catch (e) {
          // 跳过无效的 JSON
        }
      }
    }

    console.log('\n✅ 成功: 接收到流式响应');
    console.log(`  完整内容长度: ${fullContent.length} 字符`);
    return true;
  } catch (error) {
    console.error(`\n❌ 失败: ${error.message}`);
    return false;
  }
}

// 测试 4: Anthropic 消息生成（非流式）
async function testAnthropicMessages() {
  console.log('\n🤖 测试 4: Anthropic Messages API (非流式)');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: '@cf/google/gemma-4-26b-a4b-it',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Respond with just "OK" and nothing else.' }
        ]
      }),
    });

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    const usage = data.usage;

    console.log(`✅ 成功:`);
    console.log(`  回复: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    console.log(`  用量: ${usage?.input_tokens || 0} 输入 + ${usage?.output_tokens || 0} 输出`);
    return true;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}`);
    return false;
  }
}

// 测试 5: 嵌入向量
async function testEmbeddings() {
  console.log('\n🔢 测试 5: 嵌入向量生成');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: '@cf/baai/bge-base-en-v1.5',
        input: 'Hello world'
      }),
    });

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding || [];
    const usage = data.usage;

    console.log(`✅ 成功:`);
    console.log(`  向量维度: ${embedding.length}`);
    console.log(`  前 5 个值: [${embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`  用量: ${usage?.prompt_tokens || 0} tokens`);
    return true;
  } catch (error) {
    console.error(`❌ 失败: ${error.message}`);
    return false;
  }
}

// 测试 6: 无效 API Key
async function testInvalidApiKey() {
  console.log('\n🔐 测试 6: 无效 API Key 处理');
  console.log('='.repeat(60));
  
  try {
    const response = await request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-key-12345',
      },
      body: JSON.stringify({
        model: '@cf/google/gemma-4-26b-a4b-it',
        messages: [{ role: 'user', content: 'test' }]
      }),
      expectError: true,
    });

    if (response.status === 401) {
      console.log(`✅ 成功: 正确返回 401 Unauthorized`);
      return true;
    } else {
      console.error(`❌ 失败: 期望 401，实际 ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 失败: ${error.message}`);
    return false;
  }
}

// 主测试函数
async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Cloudflare AI Console API 客户端测试套件            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n🌐 Base URL: ${BASE_URL}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 12)}...${API_KEY.substring(API_KEY.length - 4)}`);

  const tests = [
    testListModels,
    testOpenAIChatCompletion,
    testOpenAIChatStream,
    testAnthropicMessages,
    testEmbeddings,
    testInvalidApiKey,
  ];

  const results = [];
  for (const test of tests) {
    const result = await test();
    results.push(result);
  }

  // 汇总结果
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     测试结果汇总                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log(`\n通过: ${passed}/${total} (${passRate}%)`);
  
  if (passed === total) {
    console.log('\n🎉 所有测试通过！API 工作正常。\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${total - passed} 个测试失败，请检查上方错误信息。\n`);
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(error => {
  console.error('\n💥 测试运行出错:', error);
  process.exit(1);
});

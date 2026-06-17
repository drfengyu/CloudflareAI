# Anthropic API 认证修复

## 问题描述

**测试 4: Anthropic Messages API** 返回 401 错误：
```json
{
  "error": {
    "type": "authentication_error",
    "message": "Missing API key"
  }
}
```

## 根本原因

`app/v1/messages/route.ts` 第 47 行的认证逻辑存在问题：

```typescript
// 旧代码（有问题）
const token = extractBearerToken(req.headers.get("x-api-key") || req.headers.get("authorization"));
```

**问题**：`extractBearerToken()` 函数期望格式为 `Bearer <token>` 的字符串，但 Anthropic API 规范中 `x-api-key` header 应该直接传递裸 token（不带 `Bearer` 前缀）。

根据 Anthropic API 文档：
- `x-api-key: <your-api-key>` ✅ 直接传递 token
- `authorization: Bearer <your-api-key>` ✅ Bearer 格式

旧代码将 `x-api-key` 的值也传给 `extractBearerToken()`，导致裸 token 无法被正确提取。

## 修复方案

修改 `app/v1/messages/route.ts` 第 46-50 行：

```typescript
export async function POST(req: NextRequest) {
  // Anthropic 使用 x-api-key（裸 token）或 authorization（Bearer token）
  const xApiKey = req.headers.get("x-api-key");
  const authHeader = req.headers.get("authorization");
  const token = xApiKey || extractBearerToken(authHeader);
  if (!token) {
    return Response.json({ error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }
```

**变更说明**：
1. 分别获取 `x-api-key` 和 `authorization` header
2. 优先使用 `x-api-key`（裸 token）
3. 如果没有 `x-api-key`，则从 `authorization` header 提取 Bearer token
4. 这样两种认证方式都能正常工作

## 测试结果

### 修复前
```
通过: 3/6 (50.0%)
❌ 测试 2: OpenAI 聊天补全 (非流式) - 模型已弃用
❌ 测试 3: OpenAI 流式聊天 - 模型已弃用  
❌ 测试 4: Anthropic Messages API - 认证失败
```

### 修复后（本地）
代码已修复，但需要重新部署到生产环境。

### 测试命令
```bash
BASE_URL="https://cloudai.fuwari.fun" API_KEY=*** node test-api-client.js
```

## 部署步骤

1. 确认代码修改已提交
2. 推送到 GitHub
3. Vercel 自动部署
4. 重新运行测试验证

## 附加修复：更新测试脚本模型

同时更新了 `test-api-client.js` 中使用的模型：
- 旧模型：`@cf/meta/llama-3.1-8b-instruct`（已在 2026-05-30 弃用）
- 新模型：`@cf/google/gemma-4-26b-a4b-it`（当前可用）

这解决了测试 2 和测试 3 的 410 错误。

## 相关文件

- `app/v1/messages/route.ts` - Anthropic API 路由处理器
- `test-api-client.js` - API 客户端测试脚本
- `lib/auth/api-key.ts` - API Key 认证工具函数

## 参考

- [Anthropic API 文档 - Authentication](https://docs.anthropic.com/claude/reference/authentication)
- [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) - 项目 API 使用文档

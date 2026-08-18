# Drizzle leftJoin 字段映射 Bug 修复

**修复时间**: 2025-06-25  
**Commit**: 3c28ea1

---

## 🐛 问题描述

创建名为 "dptest" 的 API Key（绑定 Deepseek 渠道），表格显示的 key 名称错误地显示为 "Deepseek"（渠道名），而不是 "dptest"。

### 现象
```
预期显示：
  名称: dptest
  渠道: Deepseek

实际显示：
  名称: Deepseek  ← 错误！应该是 dptest
  渠道: Deepseek
```

---

## 🔍 根因分析

### 1. 数据库数据正确
```bash
# 执行 scripts/check-keys.js 检查
node scripts/check-keys.js

# 输出显示数据正确：
{
  "key_name": "dptest",      ← 正确
  "channel_name": "Deepseek" ← 正确
}
```

### 2. Drizzle ORM leftJoin Bug

**原代码**（有问题）:
```typescript
const keys = await db
  .select({
    name: apiKeys.name,           // ← 字段名 "name"
    channelName: channels.name,   // ← 字段名也是 "name"
  })
  .from(apiKeys)
  .leftJoin(channels, eq(apiKeys.channelId, channels.id))
```

**问题**：
- Drizzle ORM v0.45.2 在 leftJoin 时，如果两个表有同名字段（如 `name`）
- 会发生字段映射错位，`channels.name` 错误地覆盖了 `apiKeys.name`

### 3. 相同问题的历史记录

这是项目中第二次遇到此问题：

**第一次**: `/admin/redemptions` 页面
- 症状：兑换码使用者字段错位
- 修复：移除 leftJoin，改为手动映射
- Commit: 7e33fb2

**第二次**: `/keys` 页面（本次修复）
- 症状：key 名称显示为渠道名
- 修复：同样移除 leftJoin

---

## ✅ 解决方案

### 修复代码

**Before**（有 bug）:
```typescript
const keys = await db
  .select({
    id: apiKeys.id,
    name: apiKeys.name,
    channelName: channels.name,
    channelType: channels.type,
  })
  .from(apiKeys)
  .leftJoin(channels, eq(apiKeys.channelId, channels.id))  // ← Bug 源头
```

**After**（修复后）:
```typescript
// 1. 分别查询 API keys（不使用 leftJoin）
const keys = await db
  .select({
    id: apiKeys.id,
    name: apiKeys.name,
    channelId: apiKeys.channelId,
  })
  .from(apiKeys);

// 2. 单独查询所有渠道
const allChannels = await db
  .select({ id: channels.id, name: channels.name, type: channels.type })
  .from(channels);

// 3. 手动创建映射
const channelMap = new Map(allChannels.map(c => [c.id, c]));

// 4. 映射时查找渠道信息
const data = keys.map((k) => {
  const channel = k.channelId ? channelMap.get(k.channelId) : null;
  return {
    ...k,
    channelName: channel?.name || null,
    channelType: channel?.type || null,
  };
});
```

### 优点
- ✅ 避免 Drizzle leftJoin 的字段映射 bug
- ✅ 代码更清晰，逻辑更明确
- ✅ 性能影响可忽略（渠道数量很少）

---

## 🧪 验证

### 1. 检查数据库原始数据
```bash
node scripts/check-keys.js
```

**预期输出**:
```
Recent API Keys:
─────────────────────────────────────────────────────
ID        Key Name    Channel Name    Channel Type
─────────────────────────────────────────────────────
e60f3e5b  dptest      Deepseek        deepseek
```

### 2. 刷新页面测试
1. 访问 http://localhost:3000/keys
2. 查看 "dptest" key 的显示
3. **预期**：
   - 名称列显示：`dptest` ✓
   - 渠道列显示：`Deepseek` ✓

### 3. 创建新 key 测试
1. 创建新 key，名称：`test-anthropic`
2. 绑定渠道：`Anthropic`
3. **预期**：
   - 名称列显示：`test-anthropic` ✓
   - 渠道列显示：`Anthropic` ✓

---

## 📝 影响范围

### 已修复的页面
1. ✅ `/admin/redemptions` - 兑换码列表（之前修复）
2. ✅ `/keys` - API Keys 列表（本次修复）

### 需要检查的其他页面
可能存在相同问题的页面（使用了 leftJoin）：

```bash
# 搜索所有使用 leftJoin 的地方
grep -rn "leftJoin" app/ --include="*.tsx" --include="*.ts"
```

**建议**：
- 对所有 leftJoin 查询进行 code review
- 如果两个表有同名字段，考虑改用手动映射

---

## 🔧 新增工具

### scripts/check-keys.js

检查 API keys 表的原始数据（绕过 Drizzle ORM）。

**用法**:
```bash
node scripts/check-keys.js
```

**功能**:
- 查询最近 5 个 API keys
- 显示 key_name, channel_name, channel_type
- 直接查询 D1，绕过 Drizzle
- 用于调试字段映射问题

---

## 📚 相关资源

- **Drizzle ORM Issue**: https://github.com/drizzle-team/drizzle-orm/issues/xxxxx
- **项目中的类似修复**: 
  - Commit: 7e33fb2 (redemptions 页面)
  - Commit: 3c28ea1 (keys 页面，本次)
- **检查脚本**: `scripts/check-keys.js`

---

## 💡 最佳实践

### 避免 Drizzle leftJoin Bug

**规则**：当两个表有同名字段时，**不要使用 leftJoin**。

**示例**：

❌ **错误写法**:
```typescript
.select({
  userName: users.name,
  orgName: orgs.name,  // ← 同名字段 "name"
})
.leftJoin(orgs, eq(users.orgId, orgs.id))
```

✅ **正确写法**:
```typescript
// 分别查询
const users = await db.select().from(usersTable);
const orgs = await db.select().from(orgsTable);

// 手动映射
const orgMap = new Map(orgs.map(o => [o.id, o]));
const result = users.map(u => ({
  userName: u.name,
  orgName: orgMap.get(u.orgId)?.name || null,
}));
```

---

**修复完成**: 2025-06-25  
**验证状态**: ✅ 类型检查通过，服务器运行正常  
**Git 状态**: ✅ 已推送到 origin/main

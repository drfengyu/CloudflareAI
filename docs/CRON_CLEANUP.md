# 定期清理过期临时余额任务

## 功能说明

自动清理 `temporary_balances` 表中已过期的临时余额记录，防止数据库积累无效数据。

## 实现方式

### Vercel Cron Job

**配置文件**：`vercel.json`

```json
{
  "crons": [{
    "path": "/api/cron/cleanup-expired-balances",
    "schedule": "0 2 * * *"
  }]
}
```

**执行时间**：每天凌晨 2:00 UTC（北京时间 10:00 AM）

### API 端点

**路径**：`/api/cron/cleanup-expired-balances`

**方法**：`GET` / `POST`

**认证**（可选）：
```bash
# 设置环境变量
CRON_SECRET=your-random-secret-key

# 请求时带上 Authorization 头
curl -H "Authorization: Bearer your-random-secret-key" \
  https://your-domain.com/api/cron/cleanup-expired-balances
```

## 清理逻辑

```sql
DELETE FROM temporary_balances
WHERE expiresAt <= NOW()
```

**清理对象**：
- 签到奖励过期（默认 7 天）
- 活动奖励过期
- 其他临时余额过期

**日志记录**：
- 清理时间
- 删除记录数
- 每条记录详情（userId, amount, expiresAt, description）

## 手动触发

### 方法 1：浏览器访问

```
https://your-domain.com/api/cron/cleanup-expired-balances
```

### 方法 2：curl 命令

```bash
# 不带认证（如果未设置 CRON_SECRET）
curl https://your-domain.com/api/cron/cleanup-expired-balances

# 带认证
curl -H "Authorization: Bearer your-secret" \
  https://your-domain.com/api/cron/cleanup-expired-balances
```

### 方法 3：Vercel Dashboard

1. 访问 Vercel 项目页面
2. 点击 "Deployments" 选项卡
3. 找到 "Cron Jobs" 部分
4. 点击 "Run Now" 手动触发

## 响应格式

### 成功响应

```json
{
  "success": true,
  "deleted": 3,
  "message": "Cleaned up 3 expired temporary balance(s)",
  "timestamp": "2026-06-17T02:00:00.000Z",
  "details": [
    {
      "userId": "user-123",
      "amount": 0.05,
      "expiresAt": "2026-06-10T00:00:00.000Z",
      "description": "每日签到奖励 0.05 cr（有效期 7 天）"
    }
  ]
}
```

### 无数据响应

```json
{
  "success": true,
  "deleted": 0,
  "message": "No expired temporary balances",
  "timestamp": "2026-06-17T02:00:00.000Z"
}
```

### 错误响应

```json
{
  "success": false,
  "error": "Database connection failed",
  "timestamp": "2026-06-17T02:00:00.000Z"
}
```

## 监控建议

### 日志查看

**Vercel 控制台**：
```bash
vercel logs --follow
```

**过滤 Cron 日志**：
```bash
vercel logs | grep "cleanup-expired-balances"
```

### 告警设置（可选）

如果清理记录数异常多（如 > 1000），可能表示：
- 用户大量签到后未使用
- 系统异常导致积压
- 需要调整有效期策略

## 注意事项

1. **时区问题**：Vercel Cron 使用 UTC 时间
   - `0 2 * * *` = UTC 02:00 = 北京时间 10:00
   - 建议选择用户活跃度低的时段

2. **执行超时**：Vercel Serverless 函数默认超时 10s（Hobby）/ 60s（Pro）
   - 大量数据清理可能超时
   - 考虑分批删除（批次 1000 条）

3. **并发问题**：
   - Cron Job 自动串行执行
   - 手动触发时避免重复调用

4. **成本考虑**：
   - Vercel Cron Job 计入函数执行次数
   - 每天 1 次，每月约 30 次执行

## 测试步骤

### 1. 本地测试

```bash
# 启动开发服务器
npm run dev

# 访问 API
curl http://localhost:3000/api/cron/cleanup-expired-balances
```

### 2. 生产测试

```bash
# 部署到 Vercel
vercel --prod

# 手动触发一次
curl https://your-domain.com/api/cron/cleanup-expired-balances

# 检查响应和日志
```

### 3. 模拟过期数据

```sql
-- 插入一条过期的临时余额（用于测试）
INSERT INTO temporary_balances (
  id, userId, amount, expiresAt, description, createdAt
) VALUES (
  'test-expired-001',
  'your-user-id',
  10,
  strftime('%s', 'now', '-1 day') * 1000,  -- 昨天过期
  '测试过期数据',
  strftime('%s', 'now') * 1000
);

-- 手动触发清理
-- 应该在响应中看到这条记录被删除
```

## 相关文件

- API 端点：`app/api/cron/cleanup-expired-balances/route.ts`
- Cron 配置：`vercel.json`
- 数据库 Schema：`lib/db/schema.ts`
- 扣费逻辑：`lib/usage/meter.ts`

## 更新日志

- **2026-06-17**：首次实现，每日凌晨 2:00 UTC 执行

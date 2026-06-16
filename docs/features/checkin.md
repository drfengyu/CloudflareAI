# 签到功能设计文档

> 参考：`D:\Download\new-api-main` 的签到实现

## 功能概述

日历签到功能，用户每天可签到一次，随机获得额度奖励，用于提升用户留存和活跃度。

## 数据库设计

### checkin 表

```sql
CREATE TABLE checkin (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  checkinDate TEXT NOT NULL,  -- YYYY-MM-DD 格式
  quotaAwarded REAL NOT NULL, -- 本次签到奖励的 credits
  createdAt INTEGER NOT NULL, -- 签到时间戳 (ms)
  UNIQUE(userId, checkinDate) -- 每人每天只能签到一次
);

CREATE INDEX idx_checkin_user_date ON checkin(userId, checkinDate);
```

### option 配置项

| Key | Value | 说明 |
|-----|-------|------|
| `checkin_enabled` | `"true"` / `"false"` | 是否启用签到功能 |
| `checkin_min_quota` | `"10"` | 最小奖励额度 (cr) |
| `checkin_max_quota` | `"100"` | 最大奖励额度 (cr) |

## API 接口

### GET /api/user/checkin

获取签到状态和历史记录。

**Query 参数**：
- `month`: `YYYY-MM` 格式，默认当前月份

**响应**：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "minQuota": 10,
    "maxQuota": 100,
    "stats": {
      "totalQuota": 5420,
      "totalCheckins": 87,
      "checkinCount": 15,
      "checkedInToday": true,
      "records": [
        {
          "checkinDate": "2026-06-16",
          "quotaAwarded": 45
        }
      ]
    }
  }
}
```

### POST /api/user/checkin

执行签到。

**响应**：
```json
{
  "success": true,
  "message": "签到成功",
  "data": {
    "quotaAwarded": 45,
    "checkinDate": "2026-06-16"
  }
}
```

**错误响应**：
```json
{
  "success": false,
  "message": "今日已签到"
}
```

## 前端组件

### 组件位置

`app/(dashboard)/wallet/page.tsx` - 钱包页面顶部

### 组件结构

```
CheckinCalendarCard
├─ Header
│  ├─ Icon + 标题 + "已签到"徽章
│  ├─ 折叠/展开按钮
│  └─ 签到按钮
├─ Stats (展开时显示)
│  ├─ 累计签到次数
│  ├─ 本月获得额度
│  └─ 累计获得额度
├─ Calendar (展开时显示)
│  ├─ 月份导航 (上/下月)
│  ├─ 周日-周六表头
│  ├─ 日期格子
│  │  ├─ 已签到日期：显示绿点 + Tooltip 奖励额度
│  │  └─ 当前日期：高亮显示
│  └─ 签到规则说明
└─ Loading 骨架屏
```

### 交互行为

1. **默认状态**：
   - 已签到：收起
   - 未签到：展开

2. **签到流程**：
   - 点击"立即签到"按钮
   - Loading 状态（防抖）
   - 成功：Toast 提示 + 刷新日历
   - 失败：Toast 错误信息

3. **日历交互**：
   - 月份切换：上/下月按钮
   - 悬停日期：显示奖励额度 Tooltip
   - 当前月份高亮

## 后端实现

### Server Actions

文件位置：`app/(dashboard)/wallet/checkin-actions.ts`

```typescript
export async function getCheckinStatus(month: string);
export async function performCheckin();
```

### 核心逻辑

1. **签到前检查**：
   - 签到功能是否启用
   - 今天是否已签到（防重复）

2. **奖励计算**：
   - 随机生成：`minQuota + random(0, maxQuota - minQuota)`

3. **原子操作**（D1 不支持事务，手动回滚）：
   ```typescript
   // 1. 插入 checkin 记录（UNIQUE 约束防并发）
   await db.insert(checkins).values({...})
   
   // 2. 增加用户余额
   try {
     await db.update(users)
       .set({ balanceCredits: sql`${users.balanceCredits} + ${quotaAwarded}` })
       .where(eq(users.id, userId))
   } catch (e) {
     // 回滚：删除 checkin 记录
     await db.delete(checkins).where(eq(checkins.id, checkinId))
     throw e
   }
   
   // 3. 记录 topup 流水
   await db.insert(topups).values({
     userId,
     amount: quotaAwarded,
     type: 3, // 签到充值
     description: `每日签到奖励 ${quotaAwarded} cr`
   })
   ```

## 管理后台

### 配置界面

位置：`app/(dashboard)/admin/settings/page.tsx` - "签到设置" section

**配置项**：
- ☑ 启用签到功能
- 最小奖励额度：`[10]` cr
- 最大奖励额度：`[100]` cr
- 💾 保存按钮

**保存逻辑**：
```typescript
await updateSystemOption('checkin_enabled', enabled.toString())
await updateSystemOption('checkin_min_quota', minQuota.toString())
await updateSystemOption('checkin_max_quota', maxQuota.toString())
```

## 参考文件

### new-api 后端实现

- `model/checkin.go` - 数据模型和业务逻辑
- `controller/checkin.go` - HTTP 路由处理
- `setting/operation_setting/checkin_setting.go` - 配置管理

### new-api 前端实现

- `web/default/src/features/profile/components/checkin-calendar-card.tsx` - 日历组件
- `web/default/src/features/profile/api.ts` - API 调用
- `web/default/src/features/profile/types.ts` - TypeScript 类型

### 关键代码摘录

**防重复签到**（uniqueIndex）：
```go
type Checkin struct {
    UserId      int    `gorm:"not null;uniqueIndex:idx_user_checkin_date"`
    CheckinDate string `gorm:"type:varchar(10);not null;uniqueIndex:idx_user_checkin_date"`
}
```

**日历网格渲染**（42格 = 6周）：
```typescript
const calendarDays = useMemo(() => {
  const firstDay = new Date(year, month, 1)
  const startDayOfWeek = firstDay.getDay() // 0 = Sunday
  
  // 前置空白天
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ date: prevMonthDate, isCurrentMonth: false })
  }
  
  // 当前月天数
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true })
  }
  
  // 后置空白天（补齐 7 的倍数）
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: nextMonthDate, isCurrentMonth: false })
    }
  }
  
  return days
}, [currentMonth])
```

## 实现步骤

1. ✅ 编写设计文档
2. ⬜ 扩展数据库 schema（checkin 表）
3. ⬜ 实现 Server Actions
4. ⬜ 创建 CheckinCalendarCard 组件
5. ⬜ 集成到 /wallet 页面
6. ⬜ 管理后台配置界面
7. ⬜ 测试完整流程

## 注意事项

1. **并发安全**：UNIQUE(userId, checkinDate) 约束防止重复签到
2. **手动回滚**：D1 不支持嵌套事务，失败时删除 checkin 记录
3. **时区处理**：使用服务器时区的 YYYY-MM-DD 格式
4. **默认配置**：默认关闭，避免未配置时误触发

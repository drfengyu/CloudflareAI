# Phase A — 视觉地基重构实施计划

**目标**: 参考 new-api 实现，重构 UI 地基（不改行为）

**参考源**: `D:\Download\new-api-main\web\default\src\`

---

## 📋 实施清单

### 1. oklch 主题令牌系统 ✅ (已部分完成)

**当前状态**:
- ✅ `app/globals.css` 已有 oklch 令牌
- ✅ `app/theme-presets.css` 已有主题预设
- ⚠️ 需要对照 new-api 完善

**待完善**:
- [ ] 添加 `--neutral` / `--neutral-foreground` 令牌
- [ ] 添加 `--sidebar-*` 完整令牌（已有部分）
- [ ] 添加 `--skeleton-*` 令牌
- [ ] 完善 radius 系统（sm/md/lg/xl/2xl/3xl/4xl）
- [ ] 添加 `--app-header-height` 等布局令牌

### 2. 主题预设扩展

**当前已有**:
- default (基础)
- anthropic (类 Claude)
- cloudflare (CF 橙色)

**参考 new-api 新增**:
- [ ] underground (绿-紫双色)
- [ ] rose-garden (玫瑰粉)
- [ ] ocean-breeze (海洋蓝)
- [ ] violet-mist (紫罗兰)
- [ ] emerald-forest (翠绿)

### 3. 字体系统

**new-api 字体栈**:
```css
--font-sans: 'Public Sans', sans-serif;
--font-serif: 'Lora Variable', 'Lora', ... (CJK serif fallback)
--font-inter: system fonts
--font-manrope: system fonts
--font-body: var(--font-sans) /* 可切换 */
```

**当前项目**:
```css
--font-sans: var(--font-geist-sans), ...
--font-mono: var(--font-geist-mono), ...
```

**待添加**:
- [ ] `--font-serif` 完整 CJK fallback
- [ ] `--font-body` 可切换机制
- [ ] `data-theme-font` 属性支持

### 4. shadcn/ui Primitives 手写

**已有组件** (components/ui/):
- ✅ Avatar, Badge, Button, Card
- ✅ Checkbox, Dialog, Dropdown Menu
- ✅ Input, Label, Multi-Select
- ✅ Popover, Progress, Scroll Area
- ✅ Select, Separator, Sheet, Skeleton

**需要新增**:
- [ ] Tabs
- [ ] Tooltip
- [ ] Switch
- [ ] Slider
- [ ] Textarea
- [ ] Command
- [ ] Context Menu
- [ ] Hover Card
- [ ] Menubar
- [ ] Radio Group
- [ ] Toast / Sonner

### 5. DataTable 封装

**参考**: new-api 使用 @tanstack/react-table

**当前状态**:
- ✅ keys/page.tsx 使用 table
- ⚠️ 未统一封装

**待实现**:
- [ ] `components/data-table/` 目录
- [ ] DataTable 基础组件
- [ ] Column 定义助手
- [ ] Pagination 组件
- [ ] Sorting / Filtering UI

### 6. recharts 图表封装

**当前状态**:
- ✅ dashboard 使用 recharts
- ⚠️ 未统一封装

**待实现**:
- [ ] `components/charts/` 目录
- [ ] BarChart 封装
- [ ] LineChart 封装
- [ ] PieChart 封装
- [ ] AreaChart 封装
- [ ] 统一 theme 配色

### 7. 布局重构

**Sidebar 重构**:
- [ ] 参考 new-api 分组导航
- [ ] 对话/通用/个人/管理 分组
- [ ] 可折叠侧边栏
- [ ] 固定顶部 logo + 用户区域

**Header 重构**:
- [ ] 主题切换下拉（含预设选择）
- [ ] 用户菜单（头像 + 下拉）
- [ ] 面包屑导航（可选）

**根布局**:
- [ ] ThemeProvider 集成
- [ ] Toaster 集成
- [ ] 响应式处理

### 8. 令牌迁移

**旧令牌** → **shadcn 标准令牌**:
- `text-muted` → `text-muted-foreground`
- `bg-surface` → `bg-card`
- `bg-surface-2` → `bg-secondary`
- `text-danger` → `text-destructive`

**迁移策略**:
- 保留旧令牌别名（兼容期）
- 新组件用新令牌
- 逐步迁移旧页面

---

## 🚀 实施步骤

### Step 1: 完善 globals.css (30 分钟)

1. 对照 new-api theme.css 补全令牌
2. 添加 font-serif 完整 fallback
3. 添加 skeleton / neutral 令牌
4. 完善 radius 系统

### Step 2: 扩展 theme-presets.css (30 分钟)

1. 从 new-api 复制 underground / rose-garden 等预设
2. 调整为本项目配色方案
3. 添加 data-theme-radius / data-theme-scale 支持

### Step 3: 新增缺失组件 (2 小时)

1. Tabs, Tooltip, Switch (高频)
2. Textarea, Command (中频)
3. 其他按需添加

### Step 4: DataTable 统一封装 (1 小时)

1. 创建 components/data-table/
2. 封装通用 DataTable
3. 迁移 keys/page.tsx 为示例

### Step 5: 图表统一封装 (1 小时)

1. 创建 components/charts/
2. 封装常用图表组件
3. 统一 theme 配色

### Step 6: 布局重构 (2 小时)

1. 重写 sidebar（分组导航）
2. 重写 header（主题切换 + 用户菜单）
3. 根布局集成 ThemeProvider

### Step 7: 令牌迁移 (1 小时)

1. 全局搜索替换旧令牌
2. 保留别名向后兼容
3. 更新文档

---

## ✅ 验证清单

- [ ] TypeScript 类型检查通过
- [ ] 所有页面正常渲染
- [ ] 主题切换正常
- [ ] 深色模式正常
- [ ] 响应式布局正常
- [ ] 图表显示正常
- [ ] DataTable 功能正常

---

## 📊 预估工作量

- **总计**: 8-10 小时
- **优先级**: P1（视觉基础）
- **依赖**: 无（独立任务）
- **影响**: 全项目 UI 一致性

---

## 🎯 成功标准

1. ✅ UI 统一使用 oklch 令牌
2. ✅ 5+ 主题预设可选
3. ✅ 所有 shadcn primitives 就绪
4. ✅ DataTable / Charts 统一封装
5. ✅ 布局清晰分组（sidebar）
6. ✅ 主题切换流畅

---

**下一步**: 开始 Step 1 — 完善 globals.css

# 文档目录

本项目的文档按照用途和时间组织。

## 📁 文档结构

### 根目录文档（必读）

- **README.md** - 项目介绍和快速开始
- **CLAUDE.md** - 项目开发文档和进度跟踪
- **CHANGELOG.md** - 版本变更记录
- **AGENTS.md** - AI Agent 配置说明
- **API_DOCUMENTATION.md** - API 接口文档
- **TROUBLESHOOTING.md** - 故障排查指南
- **VERCEL_ENV_QUICKSTART.txt** - Vercel 部署快速参考

---

## 📂 docs/ 子目录

### docs/fixes/
每日修复记录和技术分析

- `2025-06-25-keys-page-fixes.md` - API Key 功能修复
- `2025-06-25-drizzle-leftjoin-bug.md` - Drizzle ORM Bug 分析

### docs/features/
功能特性文档

- `checkin.md` - 签到功能文档

### docs/releases/
版本发布说明

- `RELEASE_v0.3.1.md` - v0.3.1 发布说明

### docs/testing/
测试报告

- `PHASE_E_F_TEST_REPORT.md` - Phase E/F 测试报告
- `TEST_REPORT.md` - 通用测试报告
- `PLAYGROUND_FIX_VERIFICATION.md` - Playground 验证报告

### docs/archive/
归档文档（历史参考）

- `TASK_COMPLETED.txt` - 任务完成总结
- `COMPLETE_FIX_SUMMARY.md` - 完整修复总结
- `DEPLOYMENT_SUCCESS.md` - 部署成功记录
- `EXCHANGE_RATE_MIGRATION.md` - 汇率迁移记录
- `temp_balance_audit_report.md` - 临时余额审计
- `claude-code-plan.md` - 开发计划（已过期）
- `vercel-env-variables.txt` - Vercel 环境变量（旧）

---

## 🔧 scripts/ 目录

### 数据库工具
- `run-migration.js` - 执行 SQL 迁移
- `check-schema.js` - 检查表结构
- `check-keys.js` - 验证 API Keys 数据
- `add-encrypted-key.js` - 添加 encryptedKey 列

### 测试脚本
- `test-admin-access.sh` - 管理员访问测试
- `test-keys-view.sh` - API Key 查看功能测试
- `test-new-pages.sh` - 新页面测试

---

## 📖 阅读顺序建议

### 新手入门
1. `README.md` - 项目概览
2. `CLAUDE.md` - 开发文档
3. `API_DOCUMENTATION.md` - API 接口

### 部署配置
1. `VERCEL_ENV_QUICKSTART.txt` - 快速开始
2. `docs/VERCEL_ENV_SETUP.md` - 详细配置
3. `TROUBLESHOOTING.md` - 问题排查

### 开发参考
1. `CHANGELOG.md` - 了解历史变更
2. `docs/fixes/` - 学习问题解决方案
3. `docs/features/` - 理解功能实现

---

## 🗂️ 文件命名规范

### 日期前缀文档
格式：`YYYY-MM-DD-topic.md`

用于每日修复、分析和临时文档。

示例：
- `2025-06-25-keys-page-fixes.md`
- `2025-06-25-drizzle-leftjoin-bug.md`

### 版本发布文档
格式：`RELEASE_vX.Y.Z.md`

用于版本发布说明。

示例：
- `RELEASE_v0.3.1.md`

### 功能文档
格式：`feature-name.md`

用于长期维护的功能说明。

示例：
- `checkin.md`

---

## 📝 文档维护

### 何时归档
文档应归档到 `docs/archive/` 当：
- 内容已过期或不再相关
- 仅作历史参考
- 被新文档替代

### 何时删除
以下文件可以删除：
- 完全重复的内容
- 临时测试输出
- 无价值的占位文件

### 更新频率
- **README.md** - 功能变更时更新
- **CLAUDE.md** - 每个开发阶段更新
- **CHANGELOG.md** - 每次发布更新
- **docs/fixes/** - 每次修复时添加

---

## 🔍 快速查找

### 寻找 Bug 修复
→ `docs/fixes/`

### 寻找功能说明
→ `docs/features/`

### 寻找版本变更
→ `CHANGELOG.md` 或 `docs/releases/`

### 寻找部署指南
→ `VERCEL_ENV_QUICKSTART.txt`

### 寻找 API 文档
→ `API_DOCUMENTATION.md`

---

**最后更新**: 2025-06-25  
**文档版本**: v1.0

#!/bin/bash

# Playground 修复部署验证脚本
# 用于检查 cloudai.fuwari.fun 是否已部署最新代码

echo "🔍 检查 Playground 修复代码部署状态"
echo "=========================================="
echo ""

BASE_URL="https://cloudai.fuwari.fun"

echo "1. 检查站点可访问性..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ 站点正常访问 (HTTP $HTTP_STATUS)"
else
    echo "   ⚠️  站点返回 HTTP $HTTP_STATUS"
fi
echo ""

echo "2. 检查 Playwright UI 测试..."
echo "   运行命令: npx playwright test playground-ui.spec.ts --grep 'Code Verification'"
echo ""
BASE_URL=$BASE_URL npx playwright test playground-ui.spec.ts --grep "Code Verification" --reporter=list 2>&1 | grep "✓\|✗\|deployed"
echo ""

echo "3. 等待部署完成建议..."
echo "   如果代码验证显示 'false'，请："
echo "   - 检查 Vercel/Cloudflare Pages 仪表板"
echo "   - 等待 2-5 分钟后重新运行此脚本"
echo "   - 检查构建日志是否有错误"
echo ""

echo "4. 手动验证步骤（推荐）..."
echo "   访问: $BASE_URL/playground/text"
echo "   测试项目："
echo "   □ 选择 Qwen QwQ-32B 模型，发送推理问题"
echo "   □ 检查思考内容是否在灰色可折叠区域"
echo "   □ 鼠标悬停助手回复，检查复制按钮"
echo "   □ 切换页面后返回，检查对话历史是否保留"
echo "   □ 发送长提示词，检查回复是否完整"
echo ""

echo "=========================================="
echo "完成时间: $(date)"

#!/bin/bash
# 快速测试 API Key 查看功能

echo "=========================================="
echo "API Key 查看功能测试"
echo "=========================================="
echo ""

# 1. 检查环境变量
echo "1. 检查环境变量..."
if grep -q "API_KEY_ENCRYPTION_SECRET=" .env.local; then
    echo "   ✓ API_KEY_ENCRYPTION_SECRET 已配置"
else
    echo "   ✗ API_KEY_ENCRYPTION_SECRET 未配置"
    echo "   请在 .env.local 中添加："
    echo "   API_KEY_ENCRYPTION_SECRET=\$(openssl rand -base64 32)"
    exit 1
fi
echo ""

# 2. 检查开发服务器
echo "2. 检查开发服务器..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "   ✓ 开发服务器正在运行"
else
    echo "   ✗ 开发服务器未启动"
    echo "   请运行：npm run dev"
    exit 1
fi
echo ""

# 3. 手动测试步骤
echo "3. 手动测试步骤："
echo "   ① 打开浏览器访问：http://localhost:3000"
echo "   ② 登录账号"
echo "   ③ 进入 /keys 页面"
echo "   ④ 创建新的 API Key"
echo "   ⑤ 点击眼睛图标 👁️ 查看完整密钥"
echo "   ⑥ 验证密钥显示正确（sk-cfai-...）"
echo "   ⑦ 点击复制按钮验证复制功能"
echo "   ⑧ 点击编辑按钮，确认对话框为中文"
echo ""

# 4. 常见问题
echo "4. 常见问题排查："
echo "   • 解密失败：重启开发服务器（Ctrl+C 后重新 npm run dev）"
echo "   • 看到 deepseek：清除浏览器缓存（Ctrl+Shift+R）"
echo "   • 旧密钥无法查看：这些密钥用旧的加密密钥创建，需重新创建"
echo ""

echo "=========================================="
echo "测试准备完成！"
echo "=========================================="

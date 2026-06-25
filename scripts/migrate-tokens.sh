#!/bin/bash
# Phase A Step 6 - Token Migration Script
# 迁移旧令牌到 shadcn/ui 标准

cd "E:\Project\Github\Useful\CloudflareAI"

echo "🔄 开始令牌迁移..."

# 计数器
count=0

# 查找所有 .tsx 和 .ts 文件（排除 node_modules 和 .next）
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.next/*" \
  ! -path "*/dist/*" | while read file; do

  # 检查文件是否包含需要替换的令牌
  if grep -q "bg-surface\b\|text-danger\b" "$file" 2>/dev/null; then
    echo "处理: $file"

    # 备份原文件
    cp "$file" "$file.bak"

    # 执行替换
    sed -i 's/bg-surface-2\b/bg-secondary/g' "$file"
    sed -i 's/bg-surface\b/bg-card/g' "$file"
    sed -i 's/text-danger\b/text-destructive/g' "$file"

    count=$((count + 1))
  fi
done

echo "✅ 完成！共处理 $count 个文件"
echo ""
echo "验证替换："
grep -r "bg-surface\b" --include="*.tsx" --include="*.ts" --exclude-dir={node_modules,.next} . | wc -l

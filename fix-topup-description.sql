-- 修正历史充值记录描述文本
-- 将描述中的 +50000 替换为 +500，使其与实际金额一致

UPDATE topup 
SET description = REPLACE(description, '+50000', '+500')
WHERE description LIKE '%+50000%' AND amount = 500;

-- 查看修复结果
SELECT id, userId, amount, type, description, createdAt 
FROM topup 
WHERE amount = 500 
ORDER BY createdAt DESC 
LIMIT 5;

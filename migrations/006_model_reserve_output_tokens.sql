-- Migration: 余额预检按模型封顶（每模型一个输出预留档位）
-- 2026-09-22
-- 预检原先按客户端 max_tokens 全量预留（Claude Code 默认 32000），
-- 在 base 倍率下算出上千 cr 的需求把请求挡在 402。改为 min(客户端 max_tokens, 本列)。

ALTER TABLE model_pricing ADD COLUMN reserveOutputTokens INTEGER DEFAULT 1024;

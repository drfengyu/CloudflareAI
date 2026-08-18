-- Migration: 支付订单表（易支付/彩虹易支付在线充值）
-- 2026-08-18
-- 记录在线充值订单：下单 → 用户支付 → 异步回调发放余额

CREATE TABLE IF NOT EXISTS payment_order (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  orderNo TEXT NOT NULL UNIQUE,
  tradeNo TEXT,
  amountCny REAL NOT NULL,
  credits REAL NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  channel TEXT,
  notifyPayload TEXT,
  paidAt INTEGER,
  createdAt INTEGER NOT NULL
);

-- 索引：按用户查订单（钱包页/订单页）
CREATE INDEX IF NOT EXISTS idx_payment_order_userId_createdAt
  ON payment_order(userId, createdAt DESC);

-- 索引：按状态查（管理端筛选/超时关闭）
CREATE INDEX IF NOT EXISTS idx_payment_order_status
  ON payment_order(status, createdAt);
-- 创建注册日志表，用于 IP 频率限制
-- Migration: add registration_log table for IP rate limiting

CREATE TABLE IF NOT EXISTS registration_log (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  email TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  userAgent TEXT
);

-- 索引：按 IP 和时间查询
CREATE INDEX idx_registration_ip_time ON registration_log(ip, createdAt);

-- 注释：
-- id: 唯一标识符
-- ip: 注册时的 IP 地址（从 x-forwarded-for 或 x-real-ip 获取）
-- email: 注册的邮箱地址
-- createdAt: 注册时间戳（毫秒）
-- userAgent: 用户代理字符串

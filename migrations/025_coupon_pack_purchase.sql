-- v0.33.0 珍宝礼包限购：累计份数与每日份数都要可查，一次 GROUP BY 取回。
-- 应用方式：node scripts/run-migration.js migrations/025_coupon_pack_purchase.sql

CREATE TABLE IF NOT EXISTS coupon_pack_purchase (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  packKey TEXT NOT NULL,
  activityKind TEXT NOT NULL,
  activityKey TEXT NOT NULL,
  priceCredits REAL NOT NULL,
  couponCredits REAL NOT NULL,
  createdAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_coupon_pack_purchase_user
  ON coupon_pack_purchase(userId, packKey, createdAt);

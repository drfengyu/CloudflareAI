-- 邀请返利：用户邀请码、邀请归因与邀请记录
-- 新增两列 + 一张表，不改动余额；老用户在这里补发随机邀请码。

ALTER TABLE user ADD COLUMN inviteCode TEXT;
ALTER TABLE user ADD COLUMN invitedBy TEXT;

UPDATE user SET inviteCode = lower(hex(randomblob(6))) WHERE inviteCode IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invite_code ON user(inviteCode);

CREATE TABLE IF NOT EXISTS invite_record (
  id TEXT PRIMARY KEY,
  inviterId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  inviteeId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  inviterReward REAL NOT NULL DEFAULT 0,
  inviteeReward REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_record_invitee ON invite_record(inviteeId);
CREATE INDEX IF NOT EXISTS idx_invite_record_inviter ON invite_record(inviterId, createdAt);

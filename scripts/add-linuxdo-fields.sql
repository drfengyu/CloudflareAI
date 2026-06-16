-- 为用户表添加 LinuxDO OAuth 字段
-- Migration: add LinuxDO OAuth fields to user table

-- 添加 LinuxDO 用户 ID 字段（唯一）
ALTER TABLE user ADD COLUMN linuxdoId TEXT UNIQUE;

-- 添加 LinuxDO 信任等级字段
ALTER TABLE user ADD COLUMN linuxdoTrustLevel INTEGER;

-- 注释：
-- linuxdoId: LinuxDO 用户的唯一标识符
-- linuxdoTrustLevel: LinuxDO 用户的信任等级（0-4），用于注册时的权限控制

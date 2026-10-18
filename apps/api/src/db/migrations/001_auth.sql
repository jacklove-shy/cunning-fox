-- 001_auth.sql —— 账号与会话（用户 brief 中优先迁移的两张表）
-- 方言：SQLite。迁 PostgreSQL 时对应 002_auth.pg.sql（SERIAL→BIGSERIAL、TEXT 不变）。

CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  salt       TEXT NOT NULL,                -- scrypt 盐（hex）
  hash       TEXT NOT NULL,                -- scrypt 哈希（hex，64 字节）
  pv         INTEGER NOT NULL DEFAULT 0,   -- 密码版本号：改密 +1，旧 Token 全部作废
  created_at TEXT NOT NULL
);

-- 会话表：签发的每个 Token 落一行（jti 为主键）。
-- 现阶段 Token 仍是 HMAC 自签（无状态），本表提供「可撤销」能力：
-- 登出单个会话 / 改密踢全员 / 未来 refresh token 轮换的落点。
CREATE TABLE IF NOT EXISTS sessions (
  jti        TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  pv         INTEGER NOT NULL DEFAULT 0,
  iat        INTEGER NOT NULL,             -- 签发时间（秒）
  exp        INTEGER NOT NULL,             -- 过期时间（秒）
  created_at TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0    -- 0 有效 / 1 已撤销
);
CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);

-- auth_meta：auth 子系统的键值存储（当前只放 HMAC 密钥 secret）。
CREATE TABLE IF NOT EXISTS auth_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

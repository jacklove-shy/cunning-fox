/**
 * 一次性搬迁：SQLite（app.db，node:sqlite 旧版） → MySQL。
 *
 * 用法（在 apps/api 目录下）：
 *   DB_HOST=127.0.0.1 DB_USER=portfolio DB_PASSWORD=xxx DB_NAME=portfolio \
 *     node scripts/migrate-sqlite-to-mysql.mjs
 *
 * 行为：
 *   1. 若 app.db 不存在 → 直接跳过（全新部署无需搬迁）。
 *   2. 读 users / sessions / auth_meta 三张表，写入 MySQL（ON DUPLICATE KEY 幂等）。
 *   3. 不改 app.db，原文件保留作备份（想彻底切换后可手动删除）。
 *
 * 必须在「MySQL 表结构已建好」之后运行（即先跑过 initDb / 正常启动过一次）。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '..');
const DB_FILE = process.env.DB_FILE || path.join(API_DIR, 'data', 'app.db');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'portfolio',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'portfolio',
  multipleStatements: true,
};

async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('[migrate] 未找到 app.db，跳过（可能是全新部署，无需搬迁）');
    return;
  }
  const sqlite = new DatabaseSync(DB_FILE);
  const conn = await mysql.createConnection(cfg);
  try {
    // auth_meta（含 hmac_secret 签名密钥）
    const metaRows = sqlite.prepare('SELECT k, v FROM auth_meta').all();
    for (const r of metaRows) {
      await conn.execute(
        'INSERT INTO auth_meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
        [r.k, r.v]
      );
    }

    // users
    const users = sqlite
      .prepare('SELECT username, role, salt, hash, pv, created_at FROM users')
      .all();
    for (const u of users) {
      await conn.execute(
        `INSERT INTO users (username, role, salt, hash, pv, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE salt = VALUES(salt), hash = VALUES(hash), pv = VALUES(pv)`,
        [u.username, u.role, u.salt, u.hash, u.pv ?? 0, u.created_at]
      );
    }

    // sessions（jti 主键）
    const sessions = sqlite
      .prepare('SELECT jti, username, role, pv, iat, exp, created_at, revoked FROM sessions')
      .all();
    for (const s of sessions) {
      await conn.execute(
        `INSERT INTO sessions (jti, username, role, pv, iat, exp, created_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE revoked = VALUES(revoked)`,
        [s.jti, s.username, s.role, s.pv ?? 0, s.iat, s.exp, s.created_at, s.revoked ?? 0]
      );
    }

    console.log(
      `[migrate] 完成：users=${users.length}, sessions=${sessions.length}, auth_meta=${metaRows.length}`
    );
  } finally {
    await conn.end();
    sqlite.close();
  }
}

main().catch((e) => {
  console.error('[migrate] 失败：', e);
  process.exit(1);
});

import { execute, query, queryOne } from '../db.js';

/**
 * auth DAO（数据访问层，MySQL 实现）。
 *
 * 边界约定：本文件是账号/会话数据进出的唯一通道。
 * - 上游（services/auth.ts）只认这里的 TypeScript 接口，不关心底层是 MySQL 还是 PostgreSQL；
 * - 迁 PG 时只重写本文件的 SQL 与连接来源，接口签名保持不变，上游零改动；
 * - 不在本文件写业务规则（校验、加密、Token 逻辑都在 services 层）；
 * - 所有 SQL 一律参数化（? 占位 + execute 预处理），禁止字符串拼接。
 *
 * 异步说明：MySQL 驱动是 Promise API，本层所有方法均为 async——
 * 上游 services 层随之全链路 async（Express 侧用 asyncHandler 捕获 rejection）。
 */

export type Role = 'admin' | 'user';

/** users 表行。AuthUser 的历史别名保留在 services/auth.ts。 */
export interface UserRow {
  username: string;
  role: Role;
  salt: string;
  hash: string;
  pv: number;
  createdAt: string;
}

/** sessions 表行：一条签发记录。 */
export interface SessionRow {
  jti: string;
  username: string;
  role: Role;
  pv: number;
  iat: number;
  exp: number;
  createdAt: string;
  revoked: 0 | 1;
}

export const authRepo = {
  /* ---------------- users ---------------- */

  async countUsers(): Promise<number> {
    const r = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users');
    return r?.n ?? 0;
  },

  async findUser(username: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
      'SELECT username, role, salt, hash, pv, created_at AS createdAt FROM users WHERE username = ?',
      [username]
    );
  },

  async listUsers(): Promise<UserRow[]> {
    return query<UserRow>(
      'SELECT username, role, salt, hash, pv, created_at AS createdAt FROM users ORDER BY created_at ASC'
    );
  },

  async insertUser(u: {
    username: string;
    role: Role;
    salt: string;
    hash: string;
    pv: number;
    createdAt: string;
  }): Promise<void> {
    await execute(
      'INSERT INTO users (username, role, salt, hash, pv, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [u.username, u.role, u.salt, u.hash, u.pv, u.createdAt]
    );
  },

  async updatePassword(username: string, salt: string, hash: string, pv: number): Promise<void> {
    await execute('UPDATE users SET salt = ?, hash = ?, pv = ? WHERE username = ?', [salt, hash, pv, username]);
  },

  async deleteUser(username: string): Promise<boolean> {
    const r = await execute('DELETE FROM users WHERE username = ?', [username]);
    return r.affectedRows > 0;
  },

  /* ---------------- auth_meta ---------------- */

  async getMeta(k: string): Promise<string | null> {
    const r = await queryOne<{ v: string }>('SELECT v FROM auth_meta WHERE k = ?', [k]);
    return r?.v ?? null;
  },

  async setMeta(k: string, v: string): Promise<void> {
    // 幂等 upsert：密钥只生成一次，重复调用不会报重复键
    await execute('INSERT INTO auth_meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, v]);
  },

  /* ---------------- sessions ---------------- */

  async insertSession(s: {
    jti: string;
    username: string;
    role: Role;
    pv: number;
    iat: number;
    exp: number;
    createdAt: string;
    revoked: 0 | 1;
  }): Promise<void> {
    await execute(
      `INSERT INTO sessions (jti, username, role, pv, iat, exp, created_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.jti, s.username, s.role, s.pv, s.iat, s.exp, s.createdAt, s.revoked]
    );
  },

  async findSession(jti: string): Promise<SessionRow | null> {
    return queryOne<SessionRow>(
      `SELECT jti, username, role, pv, iat, exp, created_at AS createdAt, revoked
       FROM sessions WHERE jti = ?`,
      [jti]
    );
  },

  /** 撤销某用户全部会话（改密后调用，双保险：pv 机制之外再兜一层）。 */
  async revokeUserSessions(username: string): Promise<void> {
    await execute('UPDATE sessions SET revoked = 1 WHERE username = ? AND revoked = 0', [username]);
  },

  /** 清理已过期会话（可由定时任务调用，当前未挂）。 */
  async cleanExpiredSessions(nowSec: number): Promise<void> {
    await execute('DELETE FROM sessions WHERE exp < ?', [nowSec]);
  },
};

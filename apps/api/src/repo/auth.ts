import { getDb } from '../db.js';

/**
 * auth DAO（数据访问层）。
 *
 * 边界约定：本文件是账号/会话数据进出的唯一通道。
 * - 上游（services/auth.ts）只认这里的 TypeScript 接口，不关心底层是 SQLite 还是 PostgreSQL；
 * - 迁 PG 时只重写本文件的 SQL 与连接来源，接口签名保持不变，上游零改动；
 * - 不在本文件写业务规则（校验、加密、Token 逻辑都在 services 层）。
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

  countUsers(): number {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM users')
      .get() as { n: number } | undefined;
    return row?.n ?? 0;
  },

  findUser(username: string): UserRow | null {
    const row = getDb()
      .prepare('SELECT username, role, salt, hash, pv, created_at AS createdAt FROM users WHERE username = ?')
      .get(username) as unknown as UserRow | undefined;
    return row ?? null;
  },

  listUsers(): UserRow[] {
    return getDb()
      .prepare('SELECT username, role, salt, hash, pv, created_at AS createdAt FROM users ORDER BY created_at ASC')
      .all() as unknown as UserRow[];
  },

  insertUser(u: UserRow): void {
    getDb()
      .prepare(
        `INSERT INTO users (username, role, salt, hash, pv, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(u.username, u.role, u.salt, u.hash, u.pv, u.createdAt);
  },

  /** 改密：换盐与哈希，pv+1。行不存在返回 false。 */
  updatePassword(username: string, salt: string, hash: string, pv: number): boolean {
    const r = getDb()
      .prepare('UPDATE users SET salt = ?, hash = ?, pv = ? WHERE username = ?')
      .run(salt, hash, pv, username);
    return Number(r.changes) > 0;
  },

  deleteUser(username: string): boolean {
    // sessions 走 ON DELETE CASCADE，用户没了会话自动消失
    const r = getDb().prepare('DELETE FROM users WHERE username = ?').run(username);
    return Number(r.changes) > 0;
  },

  /* ---------------- auth_meta ---------------- */

  getMeta(k: string): string | null {
    const row = getDb().prepare('SELECT v FROM auth_meta WHERE k = ?').get(k) as { v: string } | undefined;
    return row?.v ?? null;
  },

  setMeta(k: string, v: string): void {
    getDb()
      .prepare('INSERT INTO auth_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
      .run(k, v);
  },

  /* ---------------- sessions ---------------- */

  insertSession(s: SessionRow): void {
    getDb()
      .prepare(
        `INSERT INTO sessions (jti, username, role, pv, iat, exp, created_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(s.jti, s.username, s.role, s.pv, s.iat, s.exp, s.createdAt);
  },

  findSession(jti: string): SessionRow | null {
    const row = getDb()
      .prepare(
        `SELECT jti, username, role, pv, iat, exp, created_at AS createdAt, revoked
         FROM sessions WHERE jti = ?`,
      )
      .get(jti) as unknown as SessionRow | undefined;
    return row ?? null;
  },

  /** 撤销某用户全部会话（改密即踢下线、未来「退出所有设备」）。 */
  revokeUserSessions(username: string): number {
    const r = getDb()
      .prepare('UPDATE sessions SET revoked = 1 WHERE username = ? AND revoked = 0')
      .run(username);
    return Number(r.changes);
  },

  /** 清理已过期行（启动时或定期调用，防止 sessions 无限增长）。 */
  cleanExpiredSessions(nowSec: number): number {
    const r = getDb().prepare('DELETE FROM sessions WHERE exp < ?').run(nowSec);
    return Number(r.changes);
  },
};

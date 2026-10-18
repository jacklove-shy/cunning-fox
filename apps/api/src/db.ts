import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite 连接层（Node 22 内置 node:sqlite，零 npm 依赖）。
 *
 * 设计约定（与后续迁 PostgreSQL 的路径对齐）：
 * - 本文件是全站唯一直接接触 SQLite 的地方；业务代码只准用 repo/ 里的 DAO；
 * - schema 变更一律走 migrations/ 下的版本化 SQL，不允许在代码里散落 DDL；
 * - 迁 PG 时：新增 002_*.sql 的 PG 版本 + 换 db.ts 的连接实现，repo/ 接口不动。
 *
 * WAL 模式：读写不互斥，读不被写阻塞；busy_timeout 让并发写等待而非直接报错。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: DatabaseSync | null = null;

/** 数据库文件路径：默认 data/app.db，可用 DB_FILE 覆盖（测试/生产分离） */
export function dbFilePath(): string {
  return process.env.DB_FILE || path.join(process.cwd(), 'data', 'app.db');
}

/** 打开（或复用）连接并确保迁移已执行。启动时调用一次，之后各处直接 getDb()。 */
export function initDb(): DatabaseSync {
  if (db) return db;
  const file = dbFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec('PRAGMA foreign_keys = ON;');
  conn.exec('PRAGMA busy_timeout = 3000;');
  migrate(conn);
  db = conn;
  return db;
}

export function getDb(): DatabaseSync {
  return db || initDb();
}

/** 关闭连接（测试/优雅退出用）。WAL 下连接关闭即完成 checkpoint，无额外操作。 */
export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* 已关闭则忽略 */
    }
    db = null;
  }
}

/** 版本化迁移：db/migrations/ 下按文件名排序执行，已执行的记入 _migrations，幂等可重跑。 */
function migrate(conn: DatabaseSync): void {
  conn.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const dir = path.join(__dirname, 'db', 'migrations');
  if (!fs.existsSync(dir)) {
    // 迁移目录缺失 = 部署缺文件，静默跳过会带着空 schema 跑起来，必须硬失败
    throw new Error(`[db] 迁移目录不存在: ${dir}（部署不完整？）`);
  }
  const applied = new Set(
    conn
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => String((r as { name: unknown }).name)),
  );

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // 单个迁移包一个事务：失败即整体回滚，不会留下半套表
    conn.exec('BEGIN');
    try {
      conn.exec(sql);
      conn.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      conn.exec('COMMIT');
      console.log(`[db] migration applied → ${file}`);
    } catch (e) {
      conn.exec('ROLLBACK');
      throw new Error(`[db] migration ${file} 失败: ${(e as Error).message}`);
    }
  }
}

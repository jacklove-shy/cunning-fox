import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * MySQL 数据访问层：连接池 + 版本化迁移 + 参数化查询助手。
 *
 * 选型（2026-10-18，用户拍板企业主流栈 mysql2 + MySQL，替代 node:sqlite 版）：
 * - 连接池：MySQL 是 C/S 架构，每次查询新建 TCP 连接握手昂贵，池化复用是标配。
 *   个人站并发极低，connectionLimit=10 足够（MySQL 默认 max_connections=151）。
 * - 参数化查询：所有带值的 SQL 一律走 execute()（mysql2 服务端预处理语句），
 *   SQL 结构与数据彻底分离，从根上杜绝注入。禁止任何字符串拼接 SQL。
 * - multipleStatements 仅服务于迁移执行器（一次执行整个 .sql 文件）；
 *   业务查询全部走 execute，不接受外部拼接，故无注入面。
 * - 迁 PostgreSQL 时只重写本文件与 repo 层的 SQL，上游服务层零改动。
 */

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

/** 从环境变量读取数据库配置（未提供时给本地开发默认值）。 */
export function dbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'portfolio',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'portfolio',
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  };
}

let pool: Pool | null = null;

/** 连接池单例。首次调用时按环境变量创建。 */
export function getPool(): Pool {
  if (pool) return pool;
  const c = dbConfig();
  pool = mysql.createPool({
    ...c,
    charset: 'utf8mb4', // 4 字节字符：emoji、生僻汉字不变问号
    waitForConnections: true, // 池满时排队等待，而非直接报错
    queueLimit: 0, // 排队不设上限（个人站流量，宁等不错）
    connectTimeout: 10_000,
    enableKeepAlive: true, // 长连接保活，防中间设备掐断空闲连接
    keepAliveInitialDelay: 10_000,
    multipleStatements: true, // 仅迁移执行器需要，见文件头说明
  });
  return pool;
}

/* ---------------- 参数化查询助手（业务代码只准用这三个） ---------------- */

/** 查多行：SELECT。 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params as any);
  return rows as T[];
}

/** 查单行：找不到返回 null。 */
export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** 写操作：INSERT / UPDATE / DELETE，返回受影响行数等。 */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [r] = await getPool().execute(sql, params as any);
  return r as ResultSetHeader;
}

/* ---------------- 版本化迁移 ---------------- */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 执行 db/migrations/*.sql（按文件名排序，已应用的记录在 _migrations 表）。
 * 每个迁移包一个事务：MySQL 8 的 InnoDB 支持事务性 DDL，
 * 中途失败即整体回滚，不会留下半套表。
 */
async function migrate(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name       VARCHAR(255) NOT NULL,
         applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    const [rows] = await conn.query<RowDataPacket[]>('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r) => String(r.name)));
    const dir = path.join(__dirname, 'db', 'migrations');
    if (!fs.existsSync(dir)) throw new Error(`[db] 迁移目录不存在: ${dir}（部署不完整？）`);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await conn.beginTransaction();
      try {
        await conn.query(sql); // 整文件一次执行（多语句，迁移专用通道）
        await conn.query('INSERT INTO _migrations (name) VALUES (?)', [f]);
        await conn.commit();
        console.log(`[db] 迁移已应用: ${f}`);
      } catch (e) {
        await conn.rollback();
        throw new Error(`[db] 迁移 ${f} 失败，已回滚: ${(e as Error).message}`);
      }
    }
  } finally {
    conn.release(); // 归还连接给池，别让它泄漏
  }
}

/** 启动时调用：创建连接池 + 执行迁移。失败直接抛，让进程起不来（静默兜底会推迟故障暴露）。 */
export async function initDb(): Promise<void> {
  const c = dbConfig();
  getPool();
  console.log(`[db] MySQL ${c.user}@${c.host}:${c.port}/${c.database}（连接池上限 ${c.connectionLimit}）`);
  await migrate();
}

/** 健康探活用：一条 SELECT 1。 */
export async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

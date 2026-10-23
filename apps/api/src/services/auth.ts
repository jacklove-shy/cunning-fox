import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { authRepo, type Role, type UserRow } from '../repo/auth.js';

/**
 * 轻量权限系统（加密逻辑零依赖，存储走 MySQL，见 repo/auth.ts）。
 * - 密码：scrypt + 随机盐，防彩虹表；校验用 timingSafeEqual 防时序攻击。
 * - Token：HMAC-SHA256 自签 JWT 风格（header.payload.sig，base64url），密钥存 auth_meta 表。
 * - 会话：每个签发的 Token 在 sessions 表落一行（jti），verifyToken 时校验未被撤销，
 *   从而获得「改密踢全员 / 单会话撤销」的能力，为将来的 refresh token 轮换留好位置。
 * - 角色：admin（全权限）/ user（读 + 礼账 CRUD）；危险操作（清空、用户管理）仅 admin。
 *
 * 异步说明：MySQL 驱动是 Promise API，本层所有函数均为 async。
 * 上游（中间件 / 路由）用 asyncHandler 或 .catch(next) 接住 rejection——
 * Express 4 不会自动捕获 async 处理函数的异常。
 * 迁 PostgreSQL 时只换 repo/auth.ts 的实现，本文件的加密与业务逻辑原样复用。
 */

export type { Role } from '../repo/auth.js';
export type { UserRow } from '../repo/auth.js';
/** 历史别名：外部（如有）继续可用 */
export type AuthUser = UserRow;

export interface TokenPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
  /** 密码版本：与用户当前 pv 不一致即视为失效 */
  pv?: number;
  /** 会话 ID：对应 sessions 表主键，用于撤销校验 */
  jti?: string;
}

const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 天（秒）
const SECRET_KEY = 'hmac_secret';

/* ---------------- HMAC 密钥 ---------------- */

/**
 * 取（或首次生成）HMAC 签名密钥，持久化在 auth_meta 表。
 * 进程内缓存一份：密钥一经写入不再变更，每次验 Token 都查库纯属浪费
 * （登录/改密等写路径不受影响，仍会落到库里）。
 */
let secretCache: string | null = null;

async function loadSecret(): Promise<string> {
  if (secretCache) return secretCache;
  let s = await authRepo.getMeta(SECRET_KEY);
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    await authRepo.setMeta(SECRET_KEY, s);
  }
  secretCache = s;
  return s;
}

/* ---------------- 一次性搬迁：auth.json → MySQL ---------------- */

/**
 * 旧版（JSON 存储）遗留数据搬迁。条件：auth.json 存在且 users 表为空。
 * 搬完把原文件改名为 auth.json.pre-sqlite.bak 留档（.gitignore 的 *.bak 兜底）。
 * 幂等：任何一步不满足条件就直接跳过，重复调用无副作用。
 */
export async function migrateAuthFromJson(): Promise<void> {
  const file = path.join(process.cwd(), 'data', 'auth.json');
  if (!fs.existsSync(file)) return;
  if ((await authRepo.countUsers()) > 0) return;
  let legacy: { users?: UserRow[]; secret?: string };
  try {
    legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.warn('[auth] auth.json 解析失败，跳过搬迁（文件已备份为 .bak）');
    fs.renameSync(file, `${file}.pre-sqlite.bak`);
    return;
  }
  const users = Array.isArray(legacy.users) ? legacy.users : [];
  for (const u of users) {
    await authRepo.insertUser({
      username: u.username,
      role: u.role === 'admin' ? 'admin' : 'user',
      salt: u.salt,
      hash: u.hash,
      pv: u.pv || 0,
      createdAt: u.createdAt || new Date().toISOString(),
    });
  }
  if (legacy.secret) await authRepo.setMeta(SECRET_KEY, legacy.secret);
  fs.renameSync(file, `${file}.pre-sqlite.bak`);
  console.log(`[auth] 已从 auth.json 搬迁 ${users.length} 个用户（原文件备份为 auth.json.pre-sqlite.bak）`);
}

/* ---------------- 种子 ---------------- */

/**
 * 首次运行：若没有任何用户，创建默认管理员。
 *
 * 密码来源优先级：AUTH_ADMIN_PW 环境变量 > 随机生成。
 * 早期版本硬编码为固定口令 'admin1234'——一旦开源，任何 clone 的人
 * 都能用这组公开口令登录自己部署的实例。现在默认改为随机生成并打印到控制台，
 * 需要固定口令的场景（自动化测试 / 团队共享）显式设 AUTH_ADMIN_PW 即可。
 */
export async function ensureAuthSeed(): Promise<void> {
  if ((await authRepo.countUsers()) > 0) {
    // 密钥兜底：老数据可能没有 secret
    await loadSecret();
    return;
  }
  const configured = process.env.AUTH_ADMIN_PW;
  const pw = configured || crypto.randomBytes(9).toString('base64url');
  const { salt, hash } = hashPassword(pw);
  await authRepo.insertUser({ username: 'admin', role: 'admin', salt, hash, pv: 0, createdAt: new Date().toISOString() });
  await loadSecret();
  if (configured) {
    console.warn(`[auth] 已创建默认管理员  admin / ${pw}  （来自 AUTH_ADMIN_PW，请尽快在「账户」页改密）`);
  } else {
    console.warn(
      `[auth] 已创建默认管理员  admin / ${pw}\n` +
        `       ↑ 这是本次随机生成的密码，仅显示这一次，请立即保存。\n` +
        `         如需固定口令，启动前设置环境变量 AUTH_ADMIN_PW=你的口令。`,
    );
  }
}

/* ---------------- 密码（逻辑未动） ---------------- */

function hashPassword(pw: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(pw: string, u: UserRow): boolean {
  const h = crypto.scryptSync(pw, u.salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- Token（逻辑未动，仅增加 jti 与会话落库） ---------------- */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}
function fromB64url(s: string): Buffer {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export async function signToken(sub: string, role: Role): Promise<{ token: string; exp: number }> {
  const secret = await loadSecret();
  const u = await authRepo.findUser(sub);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL;
  const jti = crypto.randomBytes(9).toString('hex'); // 18 位十六进制，会话主键
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson({ sub, role, iat, exp, pv: u?.pv || 0, jti });
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  await authRepo.insertSession({
    jti,
    username: sub,
    role,
    pv: u?.pv || 0,
    iat,
    exp,
    createdAt: new Date().toISOString(),
    revoked: 0,
  });
  return { token: `${header}.${payload}.${sig}`, exp };
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const secret = await loadSecret();
  const expect = b64url(crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  if (expect !== sig) return null;
  try {
    const data = JSON.parse(fromB64url(payload).toString('utf8')) as TokenPayload;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    // 用户必须仍然存在；密码版本不一致 → 改密前签发的 Token 作废（改密即踢下线）
    const u = await authRepo.findUser(data.sub);
    if (!u) return null;
    if ((data.pv || 0) !== (u.pv || 0)) return null;
    // 会话必须存在且未被撤销（无 jti 的旧版 Token 一律不再接受）
    if (!data.jti) return null;
    const sess = await authRepo.findSession(data.jti);
    if (!sess || sess.revoked) return null;
    // 角色以库为准，避免令牌里的旧角色继续生效
    return { ...data, role: u.role };
  } catch {
    return null;
  }
}

/* ---------------- 业务 ---------------- */

export async function authenticate(
  username: string,
  pw: string
): Promise<{ token: string; exp: number; role: Role } | null> {
  const u = await authRepo.findUser(username);
  if (!u) return null;
  if (!verifyPassword(pw, u)) return null;
  const { token, exp } = await signToken(u.username, u.role);
  return { token, exp, role: u.role };
}

export async function listUsers(): Promise<{ username: string; role: Role; createdAt: string }[]> {
  const rows = await authRepo.listUsers();
  return rows
    .map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createUser(
  username: string,
  pw: string,
  role: Role
): Promise<{ username: string; role: Role; createdAt: string }> {
  if (await authRepo.findUser(username)) throw new Error('用户名已存在');
  if (!/^[\w一-龥]{2,20}$/.test(username)) throw new Error('用户名 2-20 位（字母/数字/中文）');
  if (!pw || pw.length < 6) throw new Error('密码至少 6 位');
  if (role !== 'admin' && role !== 'user') throw new Error('角色非法');
  const { salt, hash } = hashPassword(pw);
  const createdAt = new Date().toISOString();
  await authRepo.insertUser({ username, role, salt, hash, pv: 0, createdAt });
  return { username, role, createdAt };
}

export async function deleteUser(username: string): Promise<boolean> {
  if (username === 'admin') throw new Error('不能删除默认管理员');
  return authRepo.deleteUser(username);
}

export async function changePassword(username: string, oldPw: string, newPw: string): Promise<void> {
  const u = await authRepo.findUser(username);
  if (!u) throw new Error('用户不存在');
  if (!verifyPassword(oldPw, u)) throw new Error('原密码错误');
  if (!newPw || newPw.length < 6) throw new Error('新密码至少 6 位');
  const { salt, hash } = hashPassword(newPw);
  await authRepo.updatePassword(username, salt, hash, (u.pv || 0) + 1); // 旧 Token 全部作废
  await authRepo.revokeUserSessions(username); // 数据库层面同步撤销（双保险，覆盖未来 refresh 流）
}

import crypto from 'node:crypto';
import { readJson, writeJson } from '../store.js';

/**
 * 轻量权限系统（本地服务器模式，零额外依赖）。
 * - 密码：scrypt + 随机盐，防彩虹表；校验用 timingSafeEqual 防时序攻击。
 * - Token：HMAC-SHA256 自签 JWT 风格（header.payload.sig，base64url），密钥持久化在 auth.json。
 * - 角色：admin（全权限）/ user（读 + 礼账 CRUD）；危险操作（清空、用户管理）仅 admin。
 * 后期上云只需把 readJson/writeJson 换成真实 DB，getUser/verifyPassword 仍可复用。
 */

export type Role = 'admin' | 'user';

export interface AuthUser {
  username: string;
  role: Role;
  salt: string; // hex
  hash: string; // hex (scrypt 64 字节)
  createdAt: string;
  /** 密码版本号：每次改密 +1，随 Token 一起签发，用来精确废止旧 Token */
  pv?: number;
}

export interface AuthStore {
  users: AuthUser[];
  secret: string; // hex，HMAC 密钥
}

const FILE = 'auth.json';
const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 天（秒）

let cache: AuthStore | null = null;

export function loadAuth(): AuthStore {
  if (cache) return cache;
  const d = readJson<Partial<AuthStore>>(FILE, { users: [], secret: '' });
  if (!d.secret) d.secret = crypto.randomBytes(32).toString('hex');
  if (!Array.isArray(d.users)) d.users = [];
  cache = { users: d.users as AuthUser[], secret: d.secret };
  return cache;
}

export function saveAuth(st?: AuthStore) {
  const s = st || cache;
  if (!s) return;
  writeJson(FILE, s);
  cache = s;
}

/** 首次运行：若没有任何用户，创建默认管理员（密码来自 AUTH_ADMIN_PW 环境变量或 admin1234） */
export function ensureAuthSeed() {
  const st = loadAuth();
  if (st.users.length) {
    saveAuth(st);
    return;
  }
  const pw = process.env.AUTH_ADMIN_PW || 'admin1234';
  const { salt, hash } = hashPassword(pw);
  st.users.push({ username: 'admin', role: 'admin', salt, hash, createdAt: new Date().toISOString() });
  saveAuth(st);
  console.warn(`[auth] 已创建默认管理员  admin / ${pw}  （请尽快在「账户」页修改密码）`);
}

/* ---------------- 密码 ---------------- */

function hashPassword(pw: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(pw: string, u: AuthUser): boolean {
  const h = crypto.scryptSync(pw, u.salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- Token ---------------- */

export interface TokenPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
  /** 密码版本：与用户当前 pv 不一致即视为失效 */
  pv?: number;
}

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

export function signToken(sub: string, role: Role): { token: string; exp: number } {
  const st = loadAuth();
  const u = st.users.find((x) => x.username === sub);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL;
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson({ sub, role, iat, exp, pv: u?.pv || 0 });
  const sig = b64url(crypto.createHmac('sha256', st.secret).update(`${header}.${payload}`).digest());
  return { token: `${header}.${payload}.${sig}`, exp };
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const st = loadAuth();
  const [header, payload, sig] = parts;
  const expect = b64url(crypto.createHmac('sha256', st.secret).update(`${header}.${payload}`).digest());
  if (expect !== sig) return null;
  try {
    const data = JSON.parse(fromB64url(payload).toString('utf8')) as TokenPayload;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    // 用户必须仍然存在；密码版本不一致 → 改密前签发的 Token 作废（改密即踢下线）
    const u = st.users.find((x) => x.username === data.sub);
    if (!u) return null;
    if ((data.pv || 0) !== (u.pv || 0)) return null;
    // 角色以库为准，避免令牌里的旧角色继续生效
    return { ...data, role: u.role };
  } catch {
    return null;
  }
}

/* ---------------- 业务 ---------------- */

export function authenticate(username: string, pw: string): { token: string; exp: number; role: Role } | null {
  const st = loadAuth();
  const u = st.users.find((x) => x.username === username);
  if (!u) return null;
  if (!verifyPassword(pw, u)) return null;
  const { token, exp } = signToken(u.username, u.role);
  return { token, exp, role: u.role };
}

export function listUsers(): { username: string; role: Role; createdAt: string }[] {
  const st = loadAuth();
  return st.users
    .map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createUser(username: string, pw: string, role: Role): { username: string; role: Role; createdAt: string } {
  const st = loadAuth();
  if (st.users.find((x) => x.username === username)) throw new Error('用户名已存在');
  if (!/^[\w一-龥]{2,20}$/.test(username)) throw new Error('用户名 2-20 位（字母/数字/中文）');
  if (!pw || pw.length < 6) throw new Error('密码至少 6 位');
  if (role !== 'admin' && role !== 'user') throw new Error('角色非法');
  const { salt, hash } = hashPassword(pw);
  const u: AuthUser = { username, role, salt, hash, createdAt: new Date().toISOString() };
  st.users.push(u);
  saveAuth(st);
  return { username: u.username, role: u.role, createdAt: u.createdAt };
}

export function deleteUser(username: string): boolean {
  const st = loadAuth();
  if (username === 'admin') throw new Error('不能删除默认管理员');
  const i = st.users.findIndex((x) => x.username === username);
  if (i < 0) return false;
  st.users.splice(i, 1);
  saveAuth(st);
  return true;
}

export function changePassword(username: string, oldPw: string, newPw: string): void {
  const st = loadAuth();
  const u = st.users.find((x) => x.username === username);
  if (!u) throw new Error('用户不存在');
  if (!verifyPassword(oldPw, u)) throw new Error('原密码错误');
  if (!newPw || newPw.length < 6) throw new Error('新密码至少 6 位');
  const { salt, hash } = hashPassword(newPw);
  u.salt = salt;
  u.hash = hash;
  u.pv = (u.pv || 0) + 1; // 旧 Token 全部作废
  saveAuth(st);
}

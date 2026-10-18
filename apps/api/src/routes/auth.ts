import { Router } from 'express';
import {
  authenticate,
  changePassword,
  createUser,
  deleteUser,
  listUsers,
  type Role,
} from '../services/auth.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const authRouter = Router();

function clientIp(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string } }): string {
  return String(
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown'
  ).trim();
}

/**
 * 登录失败限流：同一 IP + 用户名 10 分钟内最多 8 次失败。
 * 只统计失败，成功一次即清零；避免正常用户输错几次就被锁死。
 */
const loginFails = new Map<string, { n: number; reset: number }>();
const LOGIN_WINDOW = 10 * 60_000;
const LOGIN_MAX_FAIL = 8;

/** 登录：用户名 + 密码 → 返回签名 Token（30 天有效） */
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const key = clientIp(req) + '|' + String(username);
  const now = Date.now();
  const rec = loginFails.get(key);
  if (rec && rec.reset > now && rec.n >= LOGIN_MAX_FAIL) {
    return res.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' });
  }
  const r = await authenticate(String(username), String(password));
  if (!r) {
    if (rec && rec.reset > now) rec.n += 1;
    else loginFails.set(key, { n: 1, reset: now + LOGIN_WINDOW });
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  loginFails.delete(key);
  res.json({ token: r.token, exp: r.exp, username: String(username), role: r.role });
}));

/**
 * 注册（公开）：角色固定 user，注册成功直接返回 Token 自动登录。
 * IP 限流：同一 IP 每小时最多 5 个**成功创建**的账号，防脚本刷号。
 * 只统计成功次数——重名、密码太短这类校验失败不该消耗配额，
 * 否则用户打错几次就得等一小时。
 */
const regHits = new Map<string, { n: number; reset: number }>();
const REG_MAX = 5;

authRouter.post('/register', asyncHandler(async (req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = regHits.get(ip);
  if (rec && rec.reset > now && rec.n >= REG_MAX) {
    return res.status(429).json({ error: '注册太频繁了，请稍后再试' });
  }

  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  try {
    await createUser(name, String(password || ''), 'user');
    // 创建成功后再计数
    if (rec && rec.reset > now) rec.n += 1;
    else regHits.set(ip, { n: 1, reset: now + 3600_000 });

    const r = await authenticate(name, String(password || ''));
    if (!r) return res.status(500).json({ error: '注册成功但自动登录失败，请手动登录' });
    res.status(201).json({ token: r.token, exp: r.exp, username: name, role: r.role });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}));

/** 当前会话信息 */
authRouter.get('/me', requireAuth(), (req: AuthedRequest, res) => {
  res.json({ username: req.auth!.sub, role: req.auth!.role });
});

/** 修改自己的密码 */
authRouter.post('/change-password', requireAuth(), asyncHandler(async (req: AuthedRequest, res) => {
  const { oldPassword, newPassword } = req.body || {};
  try {
    await changePassword(req.auth!.sub, String(oldPassword || ''), String(newPassword || ''));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}));

/** 仅管理员：用户列表 */
authRouter.get('/users', requireAuth('admin'), asyncHandler(async (_req, res) => {
  const items = await listUsers();
  res.json({ items, total: items.length });
}));

/** 仅管理员：创建用户 */
authRouter.post('/users', requireAuth('admin'), asyncHandler(async (req, res) => {
  const { username, password, role } = req.body || {};
  try {
    const u = await createUser(String(username || ''), String(password || ''), (role as Role) || 'user');
    res.status(201).json(u);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}));

/** 仅管理员：删除用户（默认管理员不可删） */
authRouter.delete('/users/:username', requireAuth('admin'), asyncHandler(async (req, res) => {
  try {
    const ok = await deleteUser(req.params.username);
    if (!ok) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
}));

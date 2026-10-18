import { Router } from 'express';
import type { ArchiveGroup, Comment, Friend, Post, TimelineItem } from '../types.js';
import { readJson, uid, writeJson } from '../store.js';
import { requireAdmin } from '../auth.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

/**
 * 预留模块接口：归档 / 友链 / 留言 / 时间线。
 * 现在全部由 data/*.json 静态驱动；后期买服务器只需把这些 readJson
 * 换成真实 DB / 远程服务，前端调用方式不变。
 */
export const extraRouter = Router();

const published = () => readJson<Post[]>('posts.json', []).filter((p) => p.status === 'published');
const strip = ({ content, ...rest }: Post) => rest;

/**
 * 自动投递接入自检：探测本机两个依赖是否就绪。
 * 由服务端发起探测（浏览器直连这两个端口会被 CORS 拦），超时 1.5s 视为未启动。
 *   · Kimi 浏览器桥接 127.0.0.1:10086 —— 驱动用户真实 Chrome 的通道
 *   · 求职自动化中台 127.0.0.1:8080  —— 岗位池 / 投递日志 / 招呼语引擎
 */
async function probe(url: string, timeoutMs = 1500): Promise<{ ok: boolean; status?: number; info?: unknown }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    let info: unknown = null;
    try {
      info = await r.json();
    } catch {
      info = null;
    }
    return { ok: r.ok, status: r.status, info };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

extraRouter.get('/bridge/status', async (_req, res) => {
  const [kimi, hunter] = await Promise.all([
    probe('http://127.0.0.1:10086/status'),
    probe('http://127.0.0.1:8080/api/state'),
  ]);
  const kimiInfo = (kimi.info || {}) as { running?: boolean; extension_connected?: boolean; extension_version?: string };
  res.json({
    kimi: {
      ok: kimi.ok && kimiInfo.running === true,
      addr: '127.0.0.1:10086',
      extensionConnected: !!kimiInfo.extension_connected,
      version: kimiInfo.extension_version || null,
    },
    hunter: {
      ok: hunter.ok,
      addr: '127.0.0.1:8080',
      consoleUrl: hunter.ok ? 'http://127.0.0.1:8080/' : null,
    },
    checkedAt: new Date().toISOString(),
  });
});

/**
 * 求职数据同步（按账号隔离，Token 鉴权）。
 * 本机 agent 用账号令牌把自己的岗位池 / 投递日志 / 求职偏好推上来，
 * 断网时本机照跑，恢复后补传。这里只做存储与合并，不含任何招聘平台凭据。
 */
const syncFile = (u: string) => `job-sync/${u.replace(/[^\w一-龥-]/g, '_')}.json`;

extraRouter.get('/bridge/sync', requireAuth(), (req: AuthedRequest, res) => {
  const snap = readJson<Record<string, unknown> | null>(syncFile(req.auth!.sub), null);
  res.json({ username: req.auth!.sub, snapshot: snap });
});

extraRouter.post('/bridge/sync', requireAuth(), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const prev = readJson<Record<string, unknown>>(syncFile(req.auth!.sub), {});
  const snap: Record<string, unknown> = {
    username: req.auth!.sub,
    updatedAt: new Date().toISOString(),
    // 只接受这三类，避免本机把无关文件塞进来
    pool: Array.isArray(b.pool) ? b.pool.slice(0, 2000) : prev.pool,
    logs: Array.isArray(b.logs) ? b.logs.slice(0, 2000) : prev.logs,
    profile: b.profile && typeof b.profile === 'object' ? b.profile : prev.profile,
    source: typeof b.source === 'string' ? String(b.source).slice(0, 40) : prev.source,
  };
  writeJson(syncFile(req.auth!.sub), snap);
  res.json({
    ok: true,
    updatedAt: snap.updatedAt,
    counts: {
      pool: Array.isArray(snap.pool) ? snap.pool.length : 0,
      logs: Array.isArray(snap.logs) ? snap.logs.length : 0,
    },
  });
});

// ---------- 导航站：外链目录（数据来自 data/nav.json） ----------
extraRouter.get('/nav', (_req, res) => {
  res.json(readJson<Record<string, unknown> | null>('nav.json', null));
});

// ---------- 归档：按 YYYY-MM 分组，倒序 ----------
extraRouter.get('/archives', (_req, res) => {
  const map = new Map<string, ReturnType<typeof strip>[]>();
  const sorted = published().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const p of sorted) {
    const month = p.createdAt.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(strip(p));
  }
  const groups: ArchiveGroup[] = [...map.entries()].map(([month, posts]) => ({ month, posts }));
  res.json({ groups, total: sorted.length });
});

// ---------- 友链 ----------
extraRouter.get('/friends', (_req, res) => {
  res.json({ items: readJson<Friend[]>('friends.json', []) });
});
extraRouter.post('/friends', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.url) return res.status(400).json({ error: 'name/url 必填' });
  const rows = readJson<Friend[]>('friends.json', []);
  const f: Friend = {
    id: uid('f_'),
    name: String(b.name),
    url: String(b.url),
    desc: String(b.desc || ''),
    avatar: b.avatar,
    tag: b.tag,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(f);
  writeJson('friends.json', rows);
  res.status(201).json(f);
});

// ---------- 留言 / 评论 ----------
extraRouter.get('/comments', (req, res) => {
  const slug = String(req.query.slug || '');
  let rows = readJson<Comment[]>('comments.json', []);
  if (slug) rows = rows.filter((c) => c.slug === slug);
  rows.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  res.json({ items: rows, total: rows.length });
});
// 留言/评论提交：必须登录（对齐小白龙），昵称强制取账号名，防止客户端伪造
extraRouter.post('/comments', requireAuth(), (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!req.auth) return res.status(401).json({ error: 'unauthorized' });
  if (!b.content || !String(b.content).trim()) return res.status(400).json({ error: 'content 必填' });
  const rows = readJson<Comment[]>('comments.json', []);
  // 楼中楼：父评论必须存在，且必须属于同一条主贴（文章 slug 相同），否则拒绝。
  // 直接降级为一级评论会在前端产生「不知回复给谁」的孤立节点，不如明确报错。
  const parentId = b.parentId ? String(b.parentId) : undefined;
  const parent = parentId ? rows.find((x) => x.id === parentId) : undefined;
  if (parentId && !parent) {
    return res.status(400).json({ error: 'parent_not_found', hint: '要回复的评论已不存在，请刷新后重试' });
  }
  const curSlug = b.slug ? String(b.slug) : undefined;
  if (parent && (parent.slug || undefined) !== curSlug) {
    return res.status(400).json({ error: 'parent_mismatch', hint: '不能回复其他页面下的评论' });
  }
  const c: Comment = {
    id: uid('c_'),
    slug: curSlug,
    nick: req.auth.sub.slice(0, 24),
    avatar: b.avatar,
    content: String(b.content).slice(0, 2000),
    top: !!b.top,
    createdAt: new Date().toISOString(),
    ...(parent ? { parentId: parent.id, replyTo: parent.nick } : {}),
  };
  rows.unshift(c);
  writeJson('comments.json', rows);
  res.status(201).json(c);
});

// ---------- 源码授权（卖源码的展示层，条款可改 data/license.json） ----------
extraRouter.get('/license', (_req, res) => {
  res.json(readJson<Record<string, unknown> | null>('license.json', null));
});

// ---------- 赞赏（收款码路线：扫码转账 → 读者认领 → 管理员确认上墙） ----------
interface Donation {
  id: string;
  nick: string;
  amount: number;
  message?: string;
  method?: string;
  status: 'pending' | 'confirmed';
  createdAt: string;
  confirmedAt?: string;
}

const donations = () => readJson<Donation[]>('donations.json', []);

/** 公开：赞赏配置 + 已确认的赞赏墙（provider 的密钥不下发） */
extraRouter.get('/donate', (_req, res) => {
  const cfg = readJson<Record<string, unknown>>('donate.json', {});
  const { provider, ...publicCfg } = cfg;
  const providerType = (provider as { type?: string } | undefined)?.type || 'qr';
  const wall = donations()
    .filter((d) => d.status === 'confirmed')
    .sort((a, b) => (b.confirmedAt || b.createdAt).localeCompare(a.confirmedAt || a.createdAt))
    .slice(0, 60);
  res.json({
    config: { ...publicCfg, providerType },
    wall,
    stats: {
      count: wall.length,
      total: wall.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    },
  });
});

/** 公开：读者认领（我转了，留个名等确认） */
extraRouter.post('/donate/claim', (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: '金额不合法' });
  if (amount > 100000) return res.status(400).json({ error: '金额超出上限' });

  const rows = donations();
  const d: Donation = {
    id: uid('d_'),
    nick: String(b.nick || '匿名好心人').slice(0, 24),
    amount: Math.round(amount * 100) / 100,
    message: b.message ? String(b.message).slice(0, 200) : undefined,
    method: b.method === 'alipay' ? 'alipay' : 'wechat',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  rows.unshift(d);
  writeJson('donations.json', rows);
  res.status(201).json({ ok: true, id: d.id, pending: true });
});

/** 管理端：待确认列表 */
extraRouter.get('/donate/pending', requireAdmin, (_req, res) => {
  const rows = donations().filter((d) => d.status === 'pending');
  res.json({ items: rows, total: rows.length });
});

/** 管理端：直接添加一条（已确认，用于补录线下赞赏） */
extraRouter.post('/donate', requireAdmin, (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: '金额不合法' });
  const rows = donations();
  const now = new Date().toISOString();
  const d: Donation = {
    id: uid('d_'),
    nick: String(b.nick || '匿名好心人').slice(0, 24),
    amount: Math.round(amount * 100) / 100,
    message: b.message ? String(b.message).slice(0, 200) : undefined,
    method: b.method === 'alipay' ? 'alipay' : 'wechat',
    status: 'confirmed',
    createdAt: now,
    confirmedAt: now,
  };
  rows.unshift(d);
  writeJson('donations.json', rows);
  res.status(201).json(d);
});

/** 管理端：确认上墙 */
extraRouter.post('/donate/:id/confirm', requireAdmin, (req, res) => {
  const rows = donations();
  const hit = rows.find((d) => d.id === req.params.id);
  if (!hit) return res.status(404).json({ error: 'not found' });
  hit.status = 'confirmed';
  hit.confirmedAt = new Date().toISOString();
  writeJson('donations.json', rows);
  res.json(hit);
});

/** 管理端：删除记录 */
extraRouter.delete('/donate/:id', requireAdmin, (req, res) => {
  const rows = donations();
  const i = rows.findIndex((d) => d.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [gone] = rows.splice(i, 1);
  writeJson('donations.json', rows);
  res.json({ ok: true, id: gone.id });
});

// ---------- 时间线 / 动态 ----------
extraRouter.get('/timeline', (_req, res) => {
  const rows = readJson<TimelineItem[]>('timeline.json', []);
  rows.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ items: rows, total: rows.length });
});

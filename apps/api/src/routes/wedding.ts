import { Router } from 'express';
import type { GiftEntry, GiftForm, GiftSide, WeddingData, WeddingMeta, WeddingStats } from '../types.js';
import { readJson, uid, writeJson } from '../store.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * 婚礼礼账本：本地随礼记账 + 理账查询。
 * 静态 JSON 驱动；后期买服务器只需把 readJson/writeJson 换成真实 DB，前端无感。
 */
export const weddingRouter = Router();

const FILE = 'wedding.json';

const DEFAULT_META: WeddingMeta = {
  groom: '',
  bride: '',
  date: '',
  venue: '',
  banquet: '',
  recorder: '',
  thanks: '感谢您拨冗莅临，共襄盛事。薄礼不成敬意，愿幸福与喜乐常伴您左右。',
};

const FORMS: GiftForm[] = ['cash', 'wechat', 'alipay', 'redpacket', 'gift'];
const SIDES: GiftSide[] = ['groom', 'bride', 'both'];

const load = (): WeddingData => {
  const d = readJson<WeddingData>(FILE, { meta: { ...DEFAULT_META }, entries: [] });
  return { meta: { ...DEFAULT_META, ...(d.meta || {}) }, entries: Array.isArray(d.entries) ? d.entries : [] };
};
const save = (d: WeddingData) => writeJson(FILE, d);

const today = () => new Date().toISOString().slice(0, 10);

/** 按查询参数过滤 + 排序，返回新数组（不改原数据） */
function queryEntries(rows: GiftEntry[], q: Record<string, unknown>): GiftEntry[] {
  const kw = String(q.q || '').trim().toLowerCase();
  const relation = String(q.relation || '');
  const side = String(q.side || '');
  const form = String(q.form || '');
  const recorder = String(q.recorder || '');
  const dateFrom = String(q.dateFrom || '');
  const dateTo = String(q.dateTo || '');
  const min = q.min === undefined || q.min === '' ? null : Number(q.min);
  const max = q.max === undefined || q.max === '' ? null : Number(q.max);

  let out = rows.filter((e) => {
    if (kw && !(`${e.name} ${e.note} ${e.relation}`.toLowerCase().includes(kw))) return false;
    if (relation && e.relation !== relation) return false;
    if (side && e.side !== side) return false;
    if (form && e.form !== form) return false;
    if (recorder && e.recorder !== recorder) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (min !== null && Number.isFinite(min) && e.amount < min) return false;
    if (max !== null && Number.isFinite(max) && e.amount > max) return false;
    return true;
  });

  const sort = String(q.sort || 'date');
  const dir = String(q.dir || 'asc') === 'desc' ? -1 : 1;
  out = [...out].sort((a, b) => {
    let r = 0;
    if (sort === 'amount') r = a.amount - b.amount;
    else if (sort === 'name') r = a.name.localeCompare(b.name, 'zh-Hans-CN');
    else if (sort === 'createdAt') r = a.createdAt.localeCompare(b.createdAt);
    else r = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
    return r * dir || a.createdAt.localeCompare(b.createdAt);
  });
  return out;
}

function statsOf(rows: GiftEntry[]): WeddingStats {
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const bySide = { groom: 0, bride: 0, both: 0 };
  for (const e of rows) if (e.side in bySide) bySide[e.side] += Number(e.amount) || 0;
  const group = (key: (e: GiftEntry) => string) => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const e of rows) {
      const k = key(e) || '未填';
      const cur = m.get(k) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(e.amount) || 0;
      m.set(k, cur);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount);
  };
  const maxEntry = rows.length ? rows.reduce((m, e) => ((Number(e.amount) || 0) > (Number(m.amount) || 0) ? e : m)) : null;
  return {
    total,
    count: rows.length,
    avg: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    max: maxEntry ? Number(maxEntry.amount) || 0 : 0,
    maxEntry,
    bySide,
    byRelation: group((e) => e.relation),
    byForm: group((e) => e.form),
    byRecorder: group((e) => e.recorder),
  };
}

/* ---------------- 设置 ---------------- */

/** 一次拉齐：设置 + 全部记录（本地工具数据量小，前端本地筛选统计） */
weddingRouter.get('/', requireAuth('user'), (_req, res) => {
  const d = load();
  res.json({ meta: d.meta, entries: d.entries, stats: statsOf(d.entries) });
});

weddingRouter.put('/meta', requireAuth('user'), (req, res) => {
  const b = req.body || {};
  const d = load();
  const meta: WeddingMeta = {
    groom: String(b.groom ?? d.meta.groom).slice(0, 30),
    bride: String(b.bride ?? d.meta.bride).slice(0, 30),
    date: String(b.date ?? d.meta.date).slice(0, 10),
    venue: String(b.venue ?? d.meta.venue).slice(0, 60),
    banquet: String(b.banquet ?? d.meta.banquet).slice(0, 40),
    recorder: String(b.recorder ?? d.meta.recorder).slice(0, 20),
    thanks: String(b.thanks ?? d.meta.thanks).slice(0, 300),
  };
  d.meta = meta;
  save(d);
  res.json(meta);
});

/* ---------------- 记账 CRUD ---------------- */

weddingRouter.get('/entries', requireAuth('user'), (req, res) => {
  const rows = queryEntries(load().entries, req.query as Record<string, unknown>);
  res.json({ items: rows, total: rows.length });
});

weddingRouter.get('/stats', requireAuth('user'), (req, res) => {
  const rows = queryEntries(load().entries, req.query as Record<string, unknown>);
  res.json(statsOf(rows));
});

weddingRouter.post('/entries', requireAuth('user'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: '来宾姓名必填' });
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999) return res.status(400).json({ error: '金额不合法（0 ~ 9999999）' });
  const form = FORMS.includes(b.form) ? (b.form as GiftForm) : 'cash';
  const side = SIDES.includes(b.side) ? (b.side as GiftSide) : 'both';
  const partySize = Math.min(99, Math.max(1, Math.round(Number(b.partySize) || 1)));
  const d = load();
  const entry: GiftEntry = {
    id: uid('g_'),
    name: name.slice(0, 30),
    title: b.title ? String(b.title).slice(0, 16) : undefined,
    amount: Math.round(amount * 100) / 100,
    relation: String(b.relation || '其他').slice(0, 12) || '其他',
    side,
    form,
    gift: b.gift ? String(b.gift).slice(0, 60) : undefined,
    partySize,
    recorder: String(b.recorder || d.meta.recorder || '').slice(0, 20),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? String(b.date) : today(),
    note: String(b.note || '').slice(0, 100),
    createdAt: new Date().toISOString(),
  };
  d.entries.push(entry);
  save(d);
  res.status(201).json(entry);
});

weddingRouter.patch('/entries/:id', requireAuth('user'), (req, res) => {
  const b = req.body || {};
  const d = load();
  const i = d.entries.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: '记录不存在' });
  const cur = d.entries[i];
  const next: GiftEntry = { ...cur };
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: '来宾姓名不能为空' });
    next.name = name.slice(0, 30);
  }
  if (b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999) return res.status(400).json({ error: '金额不合法（0 ~ 9999999）' });
    next.amount = Math.round(amount * 100) / 100;
  }
  if (b.title !== undefined) next.title = String(b.title || '').slice(0, 16);
  if (b.relation !== undefined) next.relation = String(b.relation || '其他').slice(0, 12) || '其他';
  if (b.side !== undefined && SIDES.includes(b.side)) next.side = b.side as GiftSide;
  if (b.form !== undefined && FORMS.includes(b.form)) next.form = b.form as GiftForm;
  if (b.gift !== undefined) next.gift = String(b.gift || '').slice(0, 60);
  if (b.partySize !== undefined) next.partySize = Math.min(99, Math.max(1, Math.round(Number(b.partySize) || 1)));
  if (b.recorder !== undefined) next.recorder = String(b.recorder || '').slice(0, 20);
  if (b.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) next.date = String(b.date);
  if (b.note !== undefined) next.note = String(b.note || '').slice(0, 100);
  d.entries[i] = next;
  save(d);
  res.json(next);
});

weddingRouter.delete('/entries/:id', requireAuth('user'), (req, res) => {
  const d = load();
  const i = d.entries.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: '记录不存在' });
  d.entries.splice(i, 1);
  save(d);
  res.json({ ok: true });
});

/** 清空（需 confirm=clear，防误触；仅管理员） */
weddingRouter.delete('/entries', requireAuth('admin'), (req, res) => {
  if (String(req.query.confirm || '') !== 'clear') return res.status(400).json({ error: '危险操作：请带 confirm=clear' });
  const d = load();
  d.entries = [];
  save(d);
  res.json({ ok: true });
});

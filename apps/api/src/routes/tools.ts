import { Router } from 'express';
import type { Tool } from '../types.js';
import { readJson, slugify, uid, writeJson } from '../store.js';
import { requireAdmin } from '../auth.js';

const FILE = 'tools.json';
export const toolsRouter = Router();

const all = () => readJson<Tool[]>(FILE, []);
const save = (rows: Tool[]) => writeJson(FILE, rows);

toolsRouter.get('/', (req, res) => {
  const { cat = 'all', q = '', hot = '' } = req.query as Record<string, string>;
  let rows = all();
  if (cat && cat !== 'all') rows = rows.filter((t) => t.cat === cat);
  if (hot === '1') rows = rows.filter((t) => t.hot);
  const kw = q.trim().toLowerCase();
  if (kw) {
    rows = rows.filter((t) => `${t.name} ${t.desc} ${t.tags.join(' ')} ${t.cat}`.toLowerCase().includes(kw));
  }
  const cats: Record<string, number> = {};
  for (const t of all()) cats[t.cat] = (cats[t.cat] || 0) + 1;
  res.json({ items: rows, total: rows.length, cats });
});

toolsRouter.get('/:slug', (req, res) => {
  const hit = all().find((t) => t.slug === req.params.slug || t.id === req.params.slug);
  if (!hit) return res.status(404).json({ error: 'tool not found' });
  res.json(hit);
});

toolsRouter.post('/', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name 必填' });
  const rows = all();
  const tool: Tool = {
    id: uid('t_'),
    slug: b.slug ? slugify(b.slug) : slugify(b.name),
    name: String(b.name),
    desc: String(b.desc || ''),
    cat: String(b.cat || '开发工具'),
    url: b.url,
    repo: b.repo,
    tags: Array.isArray(b.tags) ? b.tags.map(String) : String(b.tags || '').split(/[,，\s]+/).filter(Boolean),
    hot: !!b.hot,
    icon: b.icon || '🧰',
    createdAt: new Date().toISOString(),
  };
  rows.unshift(tool);
  save(rows);
  res.status(201).json(tool);
});

toolsRouter.patch('/:id', requireAdmin, (req, res) => {
  const rows = all();
  const i = rows.findIndex((t) => t.id === req.params.id || t.slug === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'tool not found' });
  rows[i] = { ...rows[i], ...req.body, id: rows[i].id, slug: rows[i].slug };
  save(rows);
  res.json(rows[i]);
});

toolsRouter.delete('/:id', requireAdmin, (req, res) => {
  const rows = all();
  const i = rows.findIndex((t) => t.id === req.params.id || t.slug === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'tool not found' });
  const [gone] = rows.splice(i, 1);
  save(rows);
  res.json({ ok: true, id: gone.id });
});

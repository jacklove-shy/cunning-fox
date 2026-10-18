import { Router } from 'express';
import type { Page, Post } from '../types.js';
import { readJson, slugify, uid, writeJson } from '../store.js';
import { requireAdmin } from '../auth.js';

const FILE = 'posts.json';
export const postsRouter = Router();

function all(): Post[] {
  return readJson<Post[]>(FILE, []);
}
function save(rows: Post[]) {
  writeJson(FILE, rows);
}

/** 列表：分类 / 搜索 / 标签 / 排序 / 分页；默认只出已发布 */
postsRouter.get('/', (req, res) => {
  const {
    cat = 'all',
    q = '',
    tag = '',
    page = '1',
    size = '10',
    status = 'published',
    sort = 'new',
  } = req.query as Record<string, string>;

  let rows = all();
  if (status !== 'all') rows = rows.filter((p) => p.status === status);
  if (cat && cat !== 'all') rows = rows.filter((p) => p.cat === cat);
  if (tag) rows = rows.filter((p) => p.tags.includes(tag));
  const kw = q.trim().toLowerCase();
  if (kw) {
    rows = rows.filter((p) =>
      `${p.title} ${p.summary} ${p.content} ${p.tags.join(' ')} ${p.cat}`.toLowerCase().includes(kw),
    );
  }

  rows.sort((a, b) => {
    if (sort === 'views') return b.views - a.views;
    if (!!b.pinned !== !!a.pinned) return b.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const sz = Math.min(50, Math.max(1, parseInt(size, 10) || 10));
  const total = rows.length;
  const result: Page<Omit<Post, 'content'> & { wordCount: number }> = {
    items: rows.slice((pg - 1) * sz, pg * sz).map(({ content, ...rest }) => ({
      ...rest,
      wordCount: content.length,
    })),
    total,
    page: pg,
    size: sz,
    totalPages: Math.max(1, Math.ceil(total / sz)),
  };
  res.json(result);
});

/** 分类 / 标签聚合（给前端筛选器用） */
postsRouter.get('/facets', (_req, res) => {
  const rows = all().filter((p) => p.status === 'published');
  const cats: Record<string, number> = {};
  const tags: Record<string, number> = {};
  for (const p of rows) {
    cats[p.cat] = (cats[p.cat] || 0) + 1;
    for (const t of p.tags) tags[t] = (tags[t] || 0) + 1;
  }
  res.json({ cats, tags, total: rows.length });
});

postsRouter.get('/:slug', (req, res) => {
  const rows = all();
  const hit = rows.find((p) => p.slug === req.params.slug || p.id === req.params.slug);
  if (!hit) return res.status(404).json({ error: 'post not found' });

  // 记录阅读数（不阻塞响应）
  hit.views += 1;
  save(rows);

  const related = rows
    .filter((p) => p.id !== hit.id && p.status === 'published' && (p.cat === hit.cat || p.tags.some((t) => hit.tags.includes(t))))
    .slice(0, 3)
    .map(({ content, ...rest }) => rest);

  // 上一篇 / 下一篇（按发布时间倒序：上一篇=更早，下一篇=更晚）
  const pub = rows.filter((p) => p.status === 'published').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const idx = pub.findIndex((p) => p.id === hit.id);
  const strip = ({ content, ...rest }: Post) => rest;
  const prevPost = idx >= 0 && idx < pub.length - 1 ? strip(pub[idx + 1]) : null;
  const nextPost = idx > 0 ? strip(pub[idx - 1]) : null;

  res.json({ ...hit, related, prev: prevPost, next: nextPost });
});

postsRouter.post('/', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'title 必填' });
  const rows = all();
  const today = new Date().toISOString();
  const post: Post = {
    id: uid('p_'),
    slug: b.slug ? slugify(b.slug) : slugify(b.title),
    title: String(b.title),
    summary: String(b.summary || String(b.content || '').slice(0, 120)),
    content: String(b.content || ''),
    cat: String(b.cat || '前端'),
    tags: Array.isArray(b.tags) ? b.tags.map(String) : String(b.tags || '').split(/[,，\s]+/).filter(Boolean),
    status: b.status === 'draft' ? 'draft' : 'published',
    views: 0,
    pinned: !!b.pinned,
    cover: b.cover,
    source: b.source,
    createdAt: today,
    updatedAt: today,
  };
  if (rows.some((p) => p.slug === post.slug)) post.slug = `${post.slug}-${post.id.slice(-4)}`;
  rows.unshift(post);
  save(rows);
  res.status(201).json(post);
});

postsRouter.patch('/:id', requireAdmin, (req, res) => {
  const rows = all();
  const i = rows.findIndex((p) => p.id === req.params.id || p.slug === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'post not found' });
  const b = req.body || {};
  const cur = rows[i];
  const next: Post = {
    ...cur,
    ...('title' in b ? { title: String(b.title) } : {}),
    ...('summary' in b ? { summary: String(b.summary) } : {}),
    ...('content' in b ? { content: String(b.content) } : {}),
    ...('cat' in b ? { cat: String(b.cat) } : {}),
    ...('tags' in b
      ? { tags: Array.isArray(b.tags) ? b.tags.map(String) : String(b.tags).split(/[,，\s]+/).filter(Boolean) }
      : {}),
    ...('status' in b ? { status: b.status === 'draft' ? 'draft' : 'published' } : {}),
    ...('pinned' in b ? { pinned: !!b.pinned } : {}),
    ...('cover' in b ? { cover: b.cover } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (b.slug) next.slug = slugify(String(b.slug));
  rows[i] = next;
  save(rows);
  res.json(next);
});

postsRouter.delete('/:id', requireAdmin, (req, res) => {
  const rows = all();
  const i = rows.findIndex((p) => p.id === req.params.id || p.slug === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'post not found' });
  const [gone] = rows.splice(i, 1);
  save(rows);
  res.json({ ok: true, id: gone.id });
});

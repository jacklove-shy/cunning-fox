import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Meta, Post, Tool } from './types.js';
import { readJson } from './store.js';
import { ensureSeed } from './seed.js';
import { postsRouter } from './routes/posts.js';
import { toolsRouter } from './routes/tools.js';
import { extraRouter } from './routes/extra.js';
import { toolkitRouter } from './routes/toolkit.js';
import { weddingRouter } from './routes/wedding.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { ensureAuthSeed, migrateAuthFromJson } from './services/auth.js';
import { initDb } from './db.js';
import { recoverJobs } from './services/toolkit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
// 默认只监听本机回环地址。工具运行时能读写本机文件、拉起 ffmpeg 子进程，
// 一旦绑到 0.0.0.0，同局域网任何人都能浏览你的磁盘。要对外提供服务时
// 显式设 HOST=0.0.0.0（并务必先给工具接口加鉴权）。
const HOST = process.env.HOST || '127.0.0.1';

/**
 * 启动序列（MySQL 全链路异步）：
 *   ensureSeed        → JSON 内容数据种子（data/*.json，与数据库无关，保持同步）
 *   initDb            → 创建 MySQL 连接池 + 执行版本化迁移
 *   migrateAuthFromJson → 一次性把 legacy auth.json 搬进 MySQL（之后自动跳过）
 *   ensureAuthSeed    → 首次运行创建默认管理员
 *   recoverJobs       → 任务队列恢复（与库无关，保持同步）
 * 任一 await 失败直接抛错，让进程起不来——静默兜底会推迟故障暴露点。
 */
async function bootstrap() {
  ensureSeed();
  await initDb(); // 创建连接池 + 执行迁移（MySQL）
  await migrateAuthFromJson(); // 一次性：legacy auth.json 数据搬进 MySQL
  await ensureAuthSeed(); // 权限系统：首次运行创建默认管理员 admin/admin1234
  recoverJobs(); // 恢复任务队列：重启前未完成的任务标记为中断
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const posts = () => readJson<Post[]>('posts.json', []);
const tools = () => readJson<Tool[]>('tools.json', []);
const meta = () => readJson<Meta | null>('meta.json', null);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'portfolio-api', at: new Date().toISOString() });
});

app.get('/api/meta', (_req, res) => {
  const m = meta();
  const pub = posts().filter((p) => p.status === 'published');
  const cats: Record<string, number> = {};
  for (const p of pub) cats[p.cat] = (cats[p.cat] || 0) + 1;
  const toolCats: Record<string, number> = {};
  for (const t of tools()) toolCats[t.cat] = (toolCats[t.cat] || 0) + 1;
  res.json({
    site: m?.site,
    postCats: m?.postCats ?? [],
    toolCats: m?.toolCats ?? [],
    facets: { postCats: cats, toolCats },
  });
});

app.get('/api/stats', (_req, res) => {
  const pub = posts().filter((p) => p.status === 'published');
  res.json({
    posts: pub.length,
    drafts: posts().length - pub.length,
    tools: tools().length,
    projects: tools().filter((t) => t.cat === '我的项目').length,
    views: pub.reduce((s, p) => s + (p.views || 0), 0),
    lastUpdated: pub.map((p) => p.updatedAt).sort().pop() || null,
  });
});

/** 集市式聚合搜索：一次查文章 / 工具 / 项目 */
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ posts: [], tools: [], q: '' });
  const hit = (s: string) => s.toLowerCase().includes(q);
  res.json({
    q,
    posts: posts()
      .filter((p) => p.status === 'published' && (hit(p.title) || hit(p.summary) || hit(p.tags.join(' '))))
      .slice(0, 5)
      .map(({ content, ...rest }) => rest),
    tools: tools()
      .filter((t) => hit(t.name) || hit(t.desc) || hit(t.tags.join(' ')))
      .slice(0, 5),
  });
});

app.use('/api/posts', postsRouter);
app.use('/api/tools', toolsRouter);
app.use('/api', extraRouter);
// 工具运行时（文件读写 / ffmpeg / 子进程）默认仅在本地开启；
// 公开部署或隧道分享时务必设 ENABLE_TOOLKIT=0，否则会把本机文件系统暴露给公网。
// 本地开发（npm run dev）默认开启，无需额外配置。
if (process.env.ENABLE_TOOLKIT !== '0') {
  app.use('/api/toolkit', toolkitRouter);
} else {
  console.log('[api] toolkit 路由未挂载（ENABLE_TOOLKIT=0）→ 公网暴露更安全');
}
app.use('/api/wedding', weddingRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);

/**
 * RSS 2.0 订阅（对齐小白龙的 feed.xml）。
 * 挂在静态托管之前，否则会被 SPA 的 catch-all 抢走、返回 index.html。
 */
app.get('/feed.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const m = meta();
  const pub = posts()
    .filter((p) => p.status === 'published')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const items = pub
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/posts/${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="true">${base}/posts/${encodeURIComponent(p.slug)}</guid>
      <pubDate>${new Date(p.createdAt || Date.now()).toUTCString()}</pubDate>
      <description>${esc(p.summary)}</description>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join('\n')}
    </item>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(m?.site?.name || '一只狡猾的狐狸')}</title>
    <link>${base}/</link>
    <description>${esc(m?.site?.desc || '')}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

// 生产模式：托管前端构建产物（前后端仍分离，只是同域部署省钱）
const dist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  // redirect:false —— 否则存在 dist/donate/ 目录时，前端路由 /donate 会被 301 到 /donate/，
  // 每个导航都多一跳，也会影响爬虫与分享卡片。
  app.use(express.static(dist, { redirect: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // 带扩展名的路径视为静态资源：缺失时必须返回 404，不能回落成 index.html。
    // 否则缺失的图片/脚本会以 200 text/html 返回，既误导前端判断，
    // 又会被 Service Worker 当成资源缓存下来（放了真图也刷不出来）。
    if (/\.[a-z0-9]{1,8}$/i.test(req.path)) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'not found', path: req.path }));

/**
 * 统一错误出口：Express 默认会返回 HTML 错误页，前端 fetch 解析 JSON 会失败。
 * 这里把 body 解析错误（400）、请求体超限（413）等全部转成 JSON。
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = Number(err?.status || err?.statusCode || 500);
  const hints: Record<number, string> = {
    400: '请求体不是合法 JSON',
    413: '请求体过大（上限 2MB）',
  };
  if (status >= 500) console.error('[api] 未处理异常', req.method, req.path, err?.message || err);
  res.status(status).json({
    error: status === 413 ? 'payload_too_large' : status === 400 ? 'bad_request' : 'server_error',
    hint: hints[status] || (status >= 500 ? '服务端异常，已记录' : undefined),
  });
});

bootstrap()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[api] http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}  bind=${HOST}  (posts=${posts().length}, tools=${tools().length})`);
      console.log(`[api] 静态托管：${fs.existsSync(dist) ? dist : '未构建（开发时由 Vite 提供前端）'}`);
      if (HOST === '0.0.0.0') console.warn('[api] ⚠ 已对外监听：工具运行时无鉴权，请勿在不可信网络使用');
    });
  })
  .catch((e) => {
    console.error('[api] 启动失败（数据库/迁移异常），进程退出：', e);
    process.exit(1);
  });

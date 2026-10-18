import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  binaryVersion, cancelJob, contentTypeFor, createJob, findFfmpeg, findFfprobe, findPython,
  getJob, guardPath, guardReadPath, listDir, listJobs, loadConfig, normalizeInput,
  runProc, saveConfig, workDirFor, zipDir, handlers,
} from '../services/toolkit.js';
import '../services/handlers.js';
import { searchVideos } from '../services/videosearch.js';
import { polishResume, polishWithLlm } from '../services/resume.js';
import { listByExt, isVideoExt, planRename } from '../services/subtitle.js';
import { TRANSCODE_PRESETS } from '../services/media.js';
import { requireAdmin } from '../auth.js';

export const toolkitRouter = Router();

/* ---------------- 环境检测 ---------------- */

toolkitRouter.get('/env', async (_req, res) => {
  const cfg = loadConfig();
  const ff = findFfmpeg();
  const fp = findFfprobe();
  const py = findPython();
  const [ffVer, fpVer, pyVer] = await Promise.all([
    ff ? binaryVersion(ff, ['-version']) : Promise.resolve(null),
    fp ? binaryVersion(fp, ['-version']) : Promise.resolve(null),
    py ? binaryVersion(py, ['--version']) : Promise.resolve(null),
  ]);
  // Pillow 探测
  let pillow: string | null = null;
  if (py) {
    const r = await runProc(py, ['-c', 'import PIL;print(PIL.__version__)'], { timeoutMs: 15000 }).promise;
    if (r.code === 0 && r.stdout.trim()) pillow = r.stdout.trim();
  }
  res.json({
    ffmpeg: { ok: !!ff && !!ffVer, path: ff, version: ffVer },
    ffprobe: { ok: !!fp && !!fpVer, path: fp, version: fpVer },
    python: { ok: !!py && !!pyVer, path: py, version: pyVer, pillow },
    roots: cfg.fsRoots,
    llm: cfg.llm ? { ...cfg.llm, apiKey: cfg.llm.apiKey ? cfg.llm.apiKey.slice(0, 6) + '****' : '' } : null,
    presets: TRANSCODE_PRESETS.map((p) => ({ id: p.id, name: p.name, desc: p.desc, ext: p.ext })),
    registered: Object.keys(handlers),
  });
});

/* ---------------- 本地文件浏览 ---------------- */

toolkitRouter.get('/fs', (req, res) => {
  const p = String(req.query.path || '') || process.cwd();
  const info = listDir(p);
  if (!info) return res.status(400).json({ error: '目录无效或不在允许的根目录内（可在配置里调整）' });
  res.json(info);
});

/** 内联预览（图片/视频/音频） */
toolkitRouter.get('/raw', (req, res) => {
  const p = guardReadPath(String(req.query.path || ''));
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).json({ error: '文件不存在或不在允许范围' });
  res.setHeader('Content-Type', contentTypeFor(p));
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(p).pipe(res);
});

/** 附件下载 */
toolkitRouter.get('/files', (req, res) => {
  const p = guardReadPath(String(req.query.path || ''));
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).json({ error: '文件不存在或不在允许范围' });
  res.setHeader('Content-Type', contentTypeFor(p));
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(p))}"`);
  fs.createReadStream(p).pipe(res);
});

/** 打包目录为 zip 供下载 */
toolkitRouter.post('/zip', async (req, res) => {
  const dir = guardPath(String(req.body?.dir || ''));
  if (!dir || !fs.existsSync(dir)) return res.status(400).json({ error: '目录无效或不在允许范围' });
  const zipDirPath = path.join(workDirFor('_zips'));
  fs.mkdirSync(zipDirPath, { recursive: true });
  const dest = path.join(zipDirPath, `${path.basename(dir)}_${Date.now().toString(36)}.zip`);
  try {
    await zipDir(dir, dest);
    res.json({ ok: true, path: dest, size: fs.statSync(dest).size });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ---------------- 任务队列 ---------------- */

toolkitRouter.post('/jobs', (req, res) => {
  const tool = String(req.body?.tool || '');
  const params = (req.body?.params || {}) as Record<string, unknown>;
  if (!handlers[tool]) return res.status(400).json({ error: `未知工具：${tool}`, registered: Object.keys(handlers) });
  const titles: Record<string, string> = {
    'img-dewatermark': '图片批量去水印',
    'video-transcode': '视频转码',
    'video-dewatermark': '视频去水印',
    subtitle: '字幕处理',
    'nowcoder-sync': '牛客题库同步',
  };
  const job = createJob(tool, String(req.body?.title || titles[tool] || tool), params);
  res.status(201).json({ id: job.id, status: job.status });
});

toolkitRouter.get('/jobs', (_req, res) => {
  res.json({ items: listJobs().slice(0, 20) });
});

toolkitRouter.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json(job);
});

toolkitRouter.post('/jobs/:id/cancel', (req, res) => {
  const ok = cancelJob(req.params.id);
  if (!ok) return res.status(400).json({ error: '任务不在可取消状态' });
  res.json({ ok: true });
});

/* ---------------- 影视聚合搜索（同步，快） ---------------- */

toolkitRouter.get('/search/videos', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.status(400).json({ error: '缺少关键词 q' });
  try {
    const r = await searchVideos(q, {
      type: (req.query.type as 'all' | 'movie' | 'tv') || 'all',
      yearFrom: req.query.yearFrom ? +req.query.yearFrom : undefined,
      yearTo: req.query.yearTo ? +req.query.yearTo : undefined,
      sort: (req.query.sort as 'relevance' | 'year' | 'rating') || 'relevance',
    });
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: '聚合搜索失败：' + (e as Error).message });
  }
});

/* ---------------- 简历润色（同步） ---------------- */

toolkitRouter.post('/resume/polish', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (text.length < 20) return res.status(400).json({ error: '简历内容太短' });
  try {
    const r = req.body?.useLlm ? await polishWithLlm(text) : polishResume(text);
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/* ---------------- 字幕：改名配对预览（同步） ---------------- */

toolkitRouter.post('/subtitle/plan-rename', (req, res) => {
  const dir = guardPath(String(req.body?.dir || ''));
  if (!dir) return res.status(400).json({ error: '目录无效或不在允许范围' });
  const videoDir = req.body?.videoDir ? guardPath(String(req.body.videoDir)) : dir;
  const subs = listByExt(dir, ['.srt', '.vtt', '.ass', '.ssa']);
  const videos = videoDir ? listByExt(videoDir, ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.rmvb']) : [];
  const pairs = planRename(subs, videos);
  res.json({ pairs, subs: subs.length, videos: videos.length });
});

/* ---------------- 牛客题库浏览（同步） ---------------- */

interface BankQ { id: string; no: number; cat: string; q: string; a: string; url: string; source?: string; fetchedAt?: string; mastery?: number; starred?: boolean }

toolkitRouter.get('/nowcoder/questions', (req, res) => {
  const bankPath = path.join(process.cwd(), 'data', 'question_bank.json');
  let bank: BankQ[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    bank = Array.isArray(raw) ? raw : (raw.questions || []);
  } catch {
    return res.json({ items: [], total: 0, cats: [], hint: '题库还没有数据，先点「同步题库」抓一批' });
  }
  const cat = String(req.query.cat || '');
  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = bank;
  if (cat) rows = rows.filter((x) => x.cat === cat);
  if (q) rows = rows.filter((x) => (x.q + x.a).toLowerCase().includes(q));
  const cats = [...new Set(bank.map((x) => x.cat))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(5, Number(req.query.size) || 10));
  const start = (page - 1) * size;
  res.json({
    items: rows.slice(start, start + size).map(({ a, ...rest }) => ({ ...rest, answer: a })),
    total: rows.length,
    cats,
    page,
    pages: Math.max(1, Math.ceil(rows.length / size)),
  });
});

/* ---------------- 配置（admin） ---------------- */

toolkitRouter.post('/config', requireAdmin, (req, res) => {
  const b = req.body || {};
  const patch: Record<string, unknown> = {};
  if (typeof b.ffmpegPath === 'string') patch.ffmpegPath = b.ffmpegPath.trim() || undefined;
  if (typeof b.pythonPath === 'string') patch.pythonPath = b.pythonPath.trim() || undefined;
  if (Array.isArray(b.fsRoots) && b.fsRoots.length) patch.fsRoots = b.fsRoots.map((r: unknown) => normalizeInput(String(r))).filter(Boolean);
  if (b.llm && typeof b.llm === 'object') {
    patch.llm = {
      baseUrl: String(b.llm.baseUrl || '').replace(/\/$/, ''),
      apiKey: String(b.llm.apiKey || ''),
      model: String(b.llm.model || ''),
    };
  }
  res.json(saveConfig(patch));
});

export { isVideoExt };

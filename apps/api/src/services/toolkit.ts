import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { readJson, writeJson } from '../store.js';

/* ============================================================
 * toolkit.ts — 工具运行时基础设施
 *  - 配置中心（ffmpeg/python 路径、LLM、可浏览根目录）
 *  - 任务队列（串行执行、进度、日志、取消、重启恢复）
 *  - 子进程管理（ffmpeg / python / node 脚本）
 *  - 本地文件浏览与下载（仅本机 127.0.0.1 使用）
 * ============================================================ */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ToolConfig {
  ffmpegPath?: string;
  pythonPath?: string;
  fsRoots: string[];
  llm: LlmConfig | null;
}

const CONFIG_FILE = 'tool-config.json';
const WORK_DIR = path.join(process.cwd(), 'data', 'work');

// 候选路径按顺序探测，第一个存在的即用。
// 优先用环境变量 / PATH，探测不到再退到常见的本地安装位置（可自行改 tool-config.json 覆盖）。
const DEFAULT_FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH || '',
  'ffmpeg',
];

const DEFAULT_PYTHON_CANDIDATES = [
  process.env.PYTHON_PATH || '',
  // WorkBuddy 托管的 Python 运行时（存在则用）
  process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, '.workbuddy', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe')
    : '',
  'python',
];

function defaultRoots(): string[] {
  // 默认只允许访问「项目目录」与「用户主目录」——
  // 早期版本把 C:\ D:\ E:\ 整盘放进白名单，等于对外暴露整台机器；
  // 现在收紧到最小必要范围，需要更多目录时在 tool-config.json 里显式添加。
  const cands = [process.cwd(), process.env.USERPROFILE || ''];
  const out: string[] = [];
  for (const c of cands) {
    if (c && fs.existsSync(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

export function loadConfig(): ToolConfig {
  const saved = readJson<Partial<ToolConfig>>(CONFIG_FILE, {});
  return {
    ffmpegPath: saved.ffmpegPath,
    pythonPath: saved.pythonPath,
    fsRoots: Array.isArray(saved.fsRoots) && saved.fsRoots.length ? saved.fsRoots : defaultRoots(),
    llm: saved.llm || null,
  };
}

export function saveConfig(patch: Partial<ToolConfig>): ToolConfig {
  const cur = loadConfig();
  const next: ToolConfig = {
    ...cur,
    ...patch,
    fsRoots: Array.isArray(patch.fsRoots) && patch.fsRoots.length ? patch.fsRoots : cur.fsRoots,
    llm: patch.llm === undefined ? cur.llm : patch.llm,
  };
  writeJson(CONFIG_FILE, next);
  return next;
}

/* ---------------- 外部二进制定位 ---------------- */

function firstExisting(cands: string[]): string | null {
  for (const c of cands) {
    if (!c) continue;
    if (c.includes('\\') || c.includes('/')) {
      if (fs.existsSync(c)) return c;
    } else {
      return c; // PATH 上的裸命令，交给 spawn 解析
    }
  }
  return null;
}

export function findFfmpeg(): string | null {
  const cfg = loadConfig();
  return firstExisting([cfg.ffmpegPath || '', ...DEFAULT_FFMPEG_CANDIDATES]);
}

export function findFfprobe(): string | null {
  const ff = findFfmpeg();
  if (ff && (ff.includes('\\') || ff.includes('/'))) {
    const sibling = path.join(path.dirname(ff), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fs.existsSync(sibling)) return sibling;
  }
  return firstExisting(['ffprobe']);
}

export function findPython(): string | null {
  const cfg = loadConfig();
  return firstExisting([cfg.pythonPath || '', ...DEFAULT_PYTHON_CANDIDATES]);
}

const versionCache = new Map<string, string | null>();
export async function binaryVersion(cmd: string, args: string[]): Promise<string | null> {
  const key = cmd + ' ' + args.join(' ');
  if (versionCache.has(key)) return versionCache.get(key)!;
  try {
    const r = await runProc(cmd, args, { timeoutMs: 8000 }).promise;
    // spawn ENOENT（PATH 上找不到该命令）→ 视为未安装
    if (r.code === -1 && /ENOENT/i.test(r.stderr)) {
      versionCache.set(key, null);
      return null;
    }
    const line = (r.stdout + r.stderr).split('\n').find((l: string) => l.trim()) || '';
    const v = line.trim().slice(0, 120) || null;
    versionCache.set(key, v);
    return v;
  } catch {
    versionCache.set(key, null);
    return null;
  }
}

/* ---------------- 子进程管理 ---------------- */

export interface RunOpts {
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  env?: Record<string, string>;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** 行缓冲输出 + 超时 + 可 kill */
export function runProc(cmd: string, args: string[], opts: RunOpts = {}): { promise: Promise<RunResult>; kill: () => void } {
  let killed = false;
  let timedOut = false;
  const cp: ChildProcess = spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let bufOut = '';
  let bufErr = '';
  const flush = (which: 'out' | 'err', last: boolean) => {
    if (which === 'out') {
      if (last && bufOut) opts.onStdout?.(bufOut), (bufOut = '');
      else {
        let i: number;
        while ((i = bufOut.indexOf('\n')) >= 0) {
          opts.onStdout?.(bufOut.slice(0, i).replace(/\r$/, ''));
          bufOut = bufOut.slice(i + 1);
        }
      }
    } else {
      if (last && bufErr) opts.onStderr?.(bufErr), (bufErr = '');
      else {
        let i: number;
        while ((i = bufErr.indexOf('\n')) >= 0) {
          opts.onStderr?.(bufErr.slice(0, i).replace(/\r$/, ''));
          bufErr = bufErr.slice(i + 1);
        }
      }
    }
  };
  cp.stdout?.on('data', (d: Buffer) => {
    stdout += d;
    bufOut += d;
    flush('out', false);
  });
  cp.stderr?.on('data', (d: Buffer) => {
    stderr += d;
    bufErr += d;
    flush('err', false);
  });
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        try { cp.kill(); } catch { /* ignore */ }
      }, opts.timeoutMs)
    : null;

  const promise = new Promise<RunResult>((resolve) => {
    cp.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      flush('out', true);
      flush('err', true);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
    cp.on('error', (e: Error) => {
      if (timer) clearTimeout(timer);
      stderr += String(e.message);
      resolve({ code: -1, signal: null, stdout, stderr, timedOut });
    });
  });
  return {
    promise,
    kill: () => {
      killed = true;
      try { cp.kill(); } catch { /* ignore */ }
    },
  };
}

/* ---------------- 任务队列 ---------------- */

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

export interface JobFile {
  name: string;
  path: string;
  size: number;
}

export interface JobResult {
  files?: JobFile[];
  outDir?: string;
  summary?: string;
  data?: unknown;
}

export interface ToolJob {
  id: string;
  tool: string;
  title: string;
  status: JobStatus;
  progress: number;
  logs: string[];
  params: Record<string, unknown>;
  result?: JobResult;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface JobCtx {
  job: ToolJob;
  log: (line: string) => void;
  setProgress: (p: number) => void;
  outDir: string;
  /** 注册子进程，取消时一并 kill */
  track: (kill: () => void) => void;
  checkAborted: () => void;
}

export type ToolHandler = (params: any, ctx: JobCtx) => Promise<JobResult>;

/** 工具处理器注册表（handlers.ts 填充） */
export const handlers: Record<string, ToolHandler> = {};

const jobs = new Map<string, ToolJob>();
const jobKills = new Map<string, Set<() => void>>();
const queue: string[] = [];
let running = false;

const JOBS_FILE = path.join('work', 'jobs.json');
const MAX_LOGS = 300;
const MAX_JOBS_KEPT = 50;

function persist(): void {
  const list = [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, MAX_JOBS_KEPT);
  writeJson(JOBS_FILE, list);
}

/** 启动时恢复：重启前未完成的任务标记为中断 */
export function recoverJobs(): void {
  const saved = readJson<ToolJob[]>(JOBS_FILE, []);
  for (const j of saved) {
    if (j.status === 'running' || j.status === 'queued') {
      j.status = 'error';
      j.error = '服务重启，任务中断（请重试）';
      j.finishedAt = new Date().toISOString();
    }
    jobs.set(j.id, j);
  }
  persist();
}

export function listJobs(): ToolJob[] {
  return [...jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getJob(id: string): ToolJob | undefined {
  return jobs.get(id);
}

export function createJob(tool: string, title: string, params: Record<string, unknown>): ToolJob {
  const job: ToolJob = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tool,
    title,
    status: 'queued',
    progress: 0,
    logs: [],
    params,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  queue.push(job.id);
  persist();
  pump();
  return job;
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') return false;
  job.status = 'canceled';
  job.error = '已被用户取消';
  job.finishedAt = new Date().toISOString();
  const kills = jobKills.get(id);
  if (kills) for (const k of kills) { try { k(); } catch { /* ignore */ } }
  job.logs.push('[系统] 任务已取消');
  persist();
  return true;
}

function pump(): void {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') {
    pump();
    return;
  }
  const handler = handlers[job.tool];
  if (!handler) {
    job.status = 'error';
    job.error = `未注册的工具处理器：${job.tool}`;
    job.finishedAt = new Date().toISOString();
    persist();
    pump();
    return;
  }
  running = true;
  job.status = 'running';
  job.logs.push(`[系统] 开始执行：${job.title}`);
  const kills = new Set<() => void>();
  jobKills.set(job.id, kills);
  const outDir = path.join(WORK_DIR, job.id);
  fs.mkdirSync(outDir, { recursive: true });

  const ctx: JobCtx = {
    job,
    log: (line: string) => {
      job.logs.push(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${line}`);
      if (job.logs.length > MAX_LOGS) job.logs.splice(0, job.logs.length - MAX_LOGS);
    },
    setProgress: (p: number) => {
      job.progress = Math.max(0, Math.min(100, Math.round(p)));
    },
    outDir,
    track: (kill: () => void) => kills.add(kill),
    checkAborted: () => {
      if (job.status !== 'running') {
        const err = new Error(job.status === 'canceled' ? '任务已取消' : '任务已中止');
        (err as Error & { aborted?: boolean }).aborted = true;
        throw err;
      }
    },
  };

  handler(job.params, ctx)
    .then((result) => {
      if (job.status === 'running') {
        job.status = 'done';
        job.progress = 100;
        job.result = result;
        job.finishedAt = new Date().toISOString();
        ctx.log('完成' + (result.summary ? `：${result.summary}` : ''));
      }
    })
    .catch((e: Error) => {
      if (job.status === 'running') {
        job.status = 'error';
        job.error = e.message || String(e);
        job.finishedAt = new Date().toISOString();
        ctx.log('失败：' + job.error);
      }
    })
    .finally(() => {
      jobKills.delete(job.id);
      running = false;
      persist();
      pump();
    });
}

/* ---------------- 本地文件浏览 / 下载 ---------------- */

export function normalizeInput(p: string): string {
  let s = String(p || '').trim().replace(/^["']|["']$/g, '');
  if (!s) return '';
  if (!path.isAbsolute(s)) s = path.resolve(process.cwd(), s);
  return path.normalize(s);
}

/**
 * 敏感路径黑名单（在「允许的根目录」之上再收一层）。
 * 根目录默认含整盘，若不额外禁止，工具面板就能读到应用自己的密钥文件：
 *   data/auth.json        → JWT 签名密钥 + 管理员密码哈希
 *   data/tool-config.json → 大模型 apiKey
 * 以及系统目录、版本库、常见私钥。data/work 是任务产物目录，必须放行。
 */
function isSensitivePath(abs: string): boolean {
  const low = abs.toLowerCase().replace(/\//g, '\\');
  const dataDir = path.resolve(process.cwd(), 'data').toLowerCase().replace(/\//g, '\\');
  const workDir = path.resolve(WORK_DIR).toLowerCase().replace(/\//g, '\\');
  const inWork = low === workDir || low.startsWith(workDir + '\\');
  if (inWork) return false;
  // 应用自身的 data 目录（除 data/work 外全部禁止）
  if (low === dataDir || low.startsWith(dataDir + '\\')) return true;
  // Windows 系统目录
  const sysDeny = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\recovery',
    'c:\\boot',
    'c:\\perflogs',
  ];
  for (const d of sysDeny) if (low === d || low.startsWith(d + '\\')) return true;
  // 任意盘的回收站 / 系统卷信息
  if (low.includes('\\$recycle.bin') || low.includes('\\system volume information')) return true;
  // 版本库、SSH 目录、常见私钥与密钥文件
  if (low.includes('\\.git\\') || low.endsWith('\\.git') || low.includes('\\.ssh\\')) return true;
  if (/\\[^\\]*(\.pem|\.key|\.pfx|\.p12)$/.test(low)) return true;
  if (/\\[^\\]*(id_rsa|id_ed25519)[^\\]*$/.test(low)) return true;
  if (/\\[^\\]*\.env(\.[^\\]*)?$/.test(low)) return true;
  return false;
}

/** 路径守卫：解析后必须落在允许的根目录内，且不在敏感黑名单（大小写不敏感） */
export function guardPath(p: string): string | null {
  const abs = normalizeInput(p);
  if (!abs) return null;
  if (isSensitivePath(abs)) return null;
  const low = abs.toLowerCase();
  const roots = loadConfig().fsRoots.map((r) => path.resolve(r).toLowerCase());
  for (const r of roots) {
    if (low === r || low.startsWith(r.endsWith('\\') ? r : r + '\\')) return abs;
  }
  return null;
}

/** 读取守卫：允许的根目录 + 应用自己的工作目录（data/work） */
export function guardReadPath(p: string): string | null {
  const hit = guardPath(p);
  if (hit) return hit;
  const abs = normalizeInput(p);
  const work = path.resolve(WORK_DIR).toLowerCase();
  if (abs && !isSensitivePath(abs) && abs.toLowerCase().startsWith(work)) return abs;
  return null;
}

export interface DirEntry {
  name: string;
  path: string;
  size?: number;
  ext?: string;
}

export function listDir(p: string): { path: string; parent: string | null; dirs: DirEntry[]; files: DirEntry[] } | null {
  const abs = guardPath(p);
  if (!abs) return null;
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!st.isDirectory()) return null;
  const dirs: DirEntry[] = [];
  const files: DirEntry[] = [];
  for (const name of fs.readdirSync(abs)) {
    const full = path.join(abs, name);
    let s: fs.Stats;
    try {
      s = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) dirs.push({ name, path: full });
    else if (s.isFile()) files.push({ name, path: full, size: s.size, ext: path.extname(name).toLowerCase() });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent !== abs ? parent : null, dirs, files };
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.ass': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

export function contentTypeFor(p: string): string {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

/** 打包目录为 zip（Windows: PowerShell Compress-Archive，零依赖） */
export async function zipDir(dir: string, dest: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('打包下载目前仅支持 Windows');
  const r = await runProc('powershell.exe', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${dir.replace(/'/g, "''")}\\*' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
  ], { timeoutMs: 120000 }).promise;
  if (!fs.existsSync(dest)) throw new Error('打包失败：' + (r.stderr || r.stdout).slice(0, 300));
}

export function workDirFor(jobId: string): string {
  return path.join(WORK_DIR, jobId);
}

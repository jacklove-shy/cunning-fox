import { useCallback, useEffect, useRef, useState } from 'react';
import { http } from '../lib/api';

/* ============================================================
 * runtime.tsx — 工具运行时共享基建
 *  useToolJob   ：创建/轮询/取消任务（跑在后端队列里的重活）
 *  JobPanel     ：进度条 + 日志 + 结果下载 + 打包 zip
 *  PathBrowser  ：本地目录浏览 / 文件多选（本机即服务器）
 *  RegionPicker ：在图片/视频上拖拽框选水印区域（归一化坐标）
 * ============================================================ */

export interface JobFile { name: string; path: string; size: number }
export interface ToolJobState {
  id: string; tool: string; title: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled';
  progress: number; logs: string[]; result?: { files?: JobFile[]; outDir?: string; summary?: string };
  error?: string; createdAt: string; finishedAt?: string;
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';

export function useToolJob(tool: string) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ToolJobState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const j = await http.get<ToolJobState>(`/toolkit/jobs/${jobId}`);
        if (!live) return;
        setJob(j);
        if (j.status === 'done' || j.status === 'error' || j.status === 'canceled') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      } catch { /* 网络抖动时静默，下次轮询恢复 */ }
    };
    tick();
    timer = setInterval(tick, 1200);
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [jobId]);

  const start = useCallback(async (params: Record<string, unknown>, title?: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await http.post<{ id: string }>('/toolkit/jobs', { tool, title, params });
      setJobId(r.id);
      setJob(null);
      return r.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [tool]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    try { await http.post(`/toolkit/jobs/${jobId}/cancel`, {}); } catch { /* ignore */ }
  }, [jobId]);

  const reset = useCallback(() => { setJobId(null); setJob(null); setError(''); }, []);

  return { job, jobId, start, cancel, reset, busy, error, setError };
}

/* ---------------- 任务面板 ---------------- */

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  queued: { text: '排队中', color: '#8a8f98' },
  running: { text: '执行中', color: '#3b82f6' },
  done: { text: '已完成', color: '#16a34a' },
  error: { text: '失败', color: '#e5484d' },
  canceled: { text: '已取消', color: '#f59e0b' },
};

export function JobPanel({ job, onCancel, onReset }: { job: ToolJobState | null; onCancel: () => void; onReset: () => void }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.logs.length]);

  if (!job) return null;
  const st = STATUS_LABEL[job.status] || STATUS_LABEL.queued;
  const active = job.status === 'queued' || job.status === 'running';

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">{job.title}</span>
        <span className="chip !py-0.5 text-[11px]" style={{ color: st.color, borderColor: st.color }}>{st.text}</span>
        {active && <span className="muted text-[11px]">{job.progress}%</span>}
        <span className="ml-auto flex gap-2">
          {active && <button className="btn sm" onClick={onCancel}>取消</button>}
          {!active && <button className="btn sm" onClick={onReset}>关闭面板</button>}
        </span>
      </div>

      {active && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--line, #e5e7eb)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${job.progress}%`, background: 'var(--accent, #ef7d3a)' }} />
        </div>
      )}

      {job.error && <p className="mb-2 text-xs" style={{ color: '#e5484d' }}>⚠ {job.error}</p>}

      {job.result?.files?.length ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold muted">
            <span>结果文件（{job.result.files.length}）</span>
            {job.result.outDir && <CopyBtn text={job.result.outDir} label="复制输出目录" />}
            {job.result.outDir && <ZipBtn dir={job.result.outDir} />}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {job.result.files.map((f) => (
              <a key={f.path} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] no-underline hover:opacity-80"
                style={{ background: 'var(--chip-bg, #f6f7f9)', color: 'inherit' }}
                href={`${BASE}/toolkit/files?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer">
                <span className="truncate">{f.name}</span>
                <span className="muted ml-auto shrink-0">{fmtSize(f.size)}</span>
                <span className="shrink-0">⬇</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {job.result?.summary && <p className="mb-2 text-[12px]" style={{ color: '#16a34a' }}>✓ {job.result.summary}</p>}

      {job.logs.length > 0 && (
        <div ref={logRef} className="rounded-lg p-2.5 font-mono text-[11px] leading-relaxed"
          style={{ background: 'var(--code-bg, #1e1f24)', color: '#d4d7dd', maxHeight: 180, overflow: 'auto' }}>
          {job.logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn sm !py-0 !text-[11px]" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}>
      {ok ? '已复制 ✓' : label}
    </button>
  );
}

function ZipBtn({ dir }: { dir: string }) {
  const [busy, setBusy] = useState(false);
  const [href, setHref] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try {
      const r = await http.post<{ path: string }>('/toolkit/zip', { dir });
      setHref(`${BASE}/toolkit/files?path=${encodeURIComponent(r.path)}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (href) return <a className="btn sm !py-0 !text-[11px]" href={href} target="_blank" rel="noreferrer">下载 zip ⬇</a>;
  return (
    <span className="inline-flex items-center gap-1">
      <button className="btn sm !py-0 !text-[11px]" onClick={go} disabled={busy}>{busy ? '打包中…' : '打包 zip'}</button>
      {err && <span className="text-[11px]" style={{ color: '#e5484d' }}>{err}</span>}
    </span>
  );
}

/* ---------------- 本地路径浏览器 ---------------- */

interface FsInfo { path: string; parent: string | null; dirs: { name: string; path: string }[]; files: { name: string; path: string; size: number; ext: string }[] }

export function PathBrowser({
  value, onChange, exts, mode = 'files', label = '目录',
}: {
  value: string[]; onChange: (v: string[]) => void; exts?: string[]; mode?: 'files' | 'dir'; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cwd, setCwd] = useState('');
  const [info, setInfo] = useState<FsInfo | null>(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<string[]>(value);

  const load = useCallback(async (p: string) => {
    setErr('');
    try {
      const r = await http.get<FsInfo>(`/toolkit/fs?path=${encodeURIComponent(p || '')}`);
      setInfo(r); setCwd(r.path);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  const openModal = () => { setPicked(value); setOpen(true); load(info?.path || ''); };

  const toggle = (p: string) => {
    setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };

  const filtered = info?.files.filter((f) => !exts || exts.includes(f.ext)) || [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn sm" onClick={openModal}>📁 浏览{label}</button>
        <span className="text-[12px] muted">
          {mode === 'dir'
            ? value[0] || '未选择'
            : value.length ? `已选 ${value.length} 个文件` : '未选择文件'}
        </span>
        {value.length > 0 && <button className="btn sm" onClick={() => onChange([])}>清空</button>}
      </div>
      {mode === 'files' && value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {value.map((p) => (
            <span key={p} className="chip !py-0.5 text-[11px]" title={p}>
              {p.split(/[\\/]/).pop()} <button className="ml-1 opacity-60 hover:opacity-100" onClick={() => onChange(value.filter((x) => x !== p))}>×</button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,17,21,.55)' }} onClick={() => setOpen(false)}>
          <div className="card w-full max-w-2xl p-4" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">选择{label}</span>
              <input className="inp sm flex-1 font-mono text-[11px]" value={cwd} onChange={(e) => setCwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load(cwd); }} />
              <button className="btn sm" onClick={() => load(cwd)}>转到</button>
              {info?.parent && <button className="btn sm" onClick={() => load(info.parent!)} title="上一级">↑</button>}
            </div>
            {err && <p className="text-xs" style={{ color: '#e5484d' }}>{err}</p>}
            <div className="min-h-0 flex-1 overflow-auto rounded-lg p-1" style={{ border: '1px solid var(--line, #e5e7eb)' }}>
              {info?.dirs.map((d) => (
                <div key={d.path} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:opacity-70"
                  onClick={() => load(d.path)} onDoubleClick={() => { if (mode === 'dir') { onChange([d.path]); setOpen(false); } }}>
                  <span>📁</span><span className="truncate">{d.name}</span>
                  {mode === 'dir' && <button className="btn sm ml-auto !py-0 !text-[11px]" onClick={(e) => { e.stopPropagation(); onChange([d.path]); setOpen(false); }}>选此目录</button>}
                </div>
              ))}
              {mode === 'files' && filtered.map((f) => (
                <div key={f.path} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:opacity-70"
                  style={picked.includes(f.path) ? { background: 'var(--chip-bg, #f6f7f9)' } : undefined}
                  onClick={() => toggle(f.path)}>
                  <span>{picked.includes(f.path) ? '☑' : '☐'}</span>
                  <span className="truncate">{f.name}</span>
                  <span className="muted ml-auto shrink-0 text-[11px]">{fmtSize(f.size)}</span>
                </div>
              ))}
              {info && info.dirs.length === 0 && filtered.length === 0 && <p className="muted p-3 text-center text-xs">空目录</p>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] muted">{mode === 'files' ? `已选 ${picked.length} 个` : ''}</span>
              <button className="btn primary sm ml-auto" onClick={() => { onChange(picked); setOpen(false); }}>确定</button>
              <button className="btn sm" onClick={() => setOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 环境状态徽标 ---------------- */

interface EnvInfo {
  ffmpeg: { ok: boolean; path: string | null; version: string | null };
  python: { ok: boolean; path: string | null; pillow: string | null };
  presets: { id: string; name: string; desc: string; ext: string }[];
}

export function useEnv() {
  const [env, setEnv] = useState<EnvInfo | null>(null);
  useEffect(() => {
    http.get<EnvInfo>('/toolkit/env').then(setEnv).catch(() => setEnv(null));
  }, []);
  return env;
}

export function EnvBadge({ env }: { env: EnvInfo | null }) {
  if (!env) return null;
  const items: { label: string; ok: boolean; detail: string }[] = [
    { label: 'ffmpeg', ok: env.ffmpeg.ok, detail: env.ffmpeg.version ? env.ffmpeg.version.replace(/\s+/g, ' ').slice(0, 40) : '未安装（视频类工具不可用）' },
    { label: 'Python', ok: env.python.ok, detail: env.python.pillow ? 'Pillow ' + env.python.pillow : '已装 Python 但缺 Pillow' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.label} className="chip !py-0.5 !text-[11px]" title={it.detail}
          style={it.ok ? { color: '#16a34a', borderColor: '#16a34a' } : { color: '#e5484d', borderColor: '#e5484d' }}>
          {it.ok ? '●' : '○'} {it.label}{it.ok ? '' : ' 缺失'}
        </span>
      ))}
    </div>
  );
}

export interface Rect { x: number; y: number; w: number; h: number }

/** 用法：把 <img>/<video> 作为 children 传入，在预览上拖拽框选 */
export function RegionPicker({ rect, onChange, children, hint }: { rect: Rect | null; onChange: (r: Rect | null) => void; children: React.ReactNode; hint?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const b = boxRef.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };

  return (
    <div>
      <div ref={boxRef} className="relative inline-block max-w-full select-none overflow-hidden rounded-lg"
        style={{ border: '1px dashed var(--line, #d1d5db)', cursor: 'crosshair', background: 'var(--chip-bg, #f6f7f9)' }}>
        {children}
        <div
          className="absolute inset-0"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = toNorm(e);
            onChange({ ...dragRef.current, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const p = toNorm(e);
            const s = dragRef.current;
            onChange({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
          }}
          onPointerUp={() => { dragRef.current = null; }}
        />
        {rect && rect.w > 0.005 && rect.h > 0.005 && (
          <div className="pointer-events-none absolute" style={{
            left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
            border: '2px solid #ef7d3a', background: 'rgba(239,125,58,.18)',
          }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] muted">
        <span>{hint || '在预览上按住拖动，框住水印区域'}</span>
        {rect && (
          <>
            <span className="chip !py-0.5 !text-[11px]">
              x {Math.round(rect.x * 100)}% · y {Math.round(rect.y * 100)}% · 宽 {Math.round(rect.w * 100)}% · 高 {Math.round(rect.h * 100)}%
            </span>
            <button className="btn sm !py-0 !text-[11px]" onClick={() => onChange(null)}>清除框选</button>
          </>
        )}
      </div>
    </div>
  );
}

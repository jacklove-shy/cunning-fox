import { useCallback, useEffect, useState } from 'react';
import { http } from '../../lib/api';
import { JobPanel, useToolJob } from '../runtime';

interface Q { id: string; no: number; cat: string; q: string; answer: string; url: string; mastery?: number; starred?: boolean }

/** 牛客题库同步（spawn 脚本抓题入库）+ 站内刷题（掌握度存本地） */
export function NowcoderSync() {
  const { job, start, cancel, reset, busy, error } = useToolJob('nowcoder-sync');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(50);
  const [delay, setDelay] = useState(800);

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <span className="text-xs font-semibold muted">同步题库（只读抓取，不动牛客任何数据）</span>
        <p className="muted mt-1 text-[11px] leading-relaxed">
          牛客「前端校招面试题目合集」共 464 题，服务端直出题面 + 参考答案，无需登录。抓取间隔别调太低（默认 800ms/题，60 题约 1 分钟）。
          已抓过的题会自动合并保留。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs muted">从第 <input className="inp sm" style={{ width: 64 }} type="number" min={1} max={464} value={from} onChange={(e) => setFrom(+e.target.value)} /> 题</label>
          <label className="text-xs muted">到第 <input className="inp sm" style={{ width: 64 }} type="number" min={1} max={464} value={to} onChange={(e) => setTo(+e.target.value)} /> 题</label>
          <label className="text-xs muted">间隔 <input className="inp sm" style={{ width: 72 }} type="number" min={300} value={delay} onChange={(e) => setDelay(+e.target.value)} /> ms</label>
          <button className="btn primary" disabled={busy || to < from} onClick={() => start({ from, to, delay })}>
            {busy ? '提交中…' : '开始同步'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{error}</p>}
      </div>

      <JobPanel job={job} onCancel={cancel} onReset={reset} />

      <QuestionBrowser />
    </div>
  );
}

const MASTERY = ['未学', '模糊', '掌握'];

function QuestionBrowser() {
  const [rows, setRows] = useState<Q[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hint, setHint] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('nc_mastery') || '{}'); } catch { return {}; }
  });

  const load = useCallback(async () => {
    try {
      const r = await http.get<{ items: Q[]; cats: string[]; page: number; pages: number; total: number; hint?: string }>(
        `/toolkit/nowcoder/questions?cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(q)}&page=${page}&size=10`);
      setRows(r.items); setCats(r.cats); setPages(r.pages); setTotal(r.total); setHint(r.hint || '');
    } catch { /* ignore */ }
  }, [cat, q, page]);

  useEffect(() => { load(); }, [load]);

  const setMastery = (id: string, v: number) => {
    const next = { ...progress, [id]: v };
    if (!v) delete next[id];
    setProgress(next);
    localStorage.setItem('nc_mastery', JSON.stringify(next));
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold muted">题库浏览（{total} 题）</span>
        <input className="inp sm ml-auto" style={{ width: 160 }} placeholder="搜题目/答案" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {hint && <p className="muted mb-2 text-[11px]">{hint}</p>}
      <div className="mb-3 flex flex-wrap gap-1">
        <button className="btn sm" style={!cat ? { background: 'var(--accent, #ef7d3a)', color: '#fff', borderColor: 'transparent' } : undefined}
          onClick={() => { setCat(''); setPage(1); }}>全部</button>
        {cats.map((c) => (
          <button key={c} className="btn sm" style={cat === c ? { background: 'var(--accent, #ef7d3a)', color: '#fff', borderColor: 'transparent' } : undefined}
            onClick={() => { setCat(c); setPage(1); }}>{c}</button>
        ))}
      </div>

      <div className="grid gap-2">
        {rows.map((item) => (
          <div key={item.id} className="rounded-lg p-3" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
            <div className="flex items-start gap-2">
              <span className="chip !py-0 shrink-0 !text-[11px]">{item.cat}</span>
              <button className="min-w-0 flex-1 text-left text-[13px] leading-relaxed" onClick={() => setOpen(open === item.id ? null : item.id)}>
                <span className="muted mr-1">#{item.no}</span>{item.q}
                <span className="muted ml-1 text-[11px]">{open === item.id ? '▲ 收起' : '▼ 看答案'}</span>
              </button>
            </div>
            {open === item.id && (
              <div className="mt-2">
                <pre className="rounded p-2.5 text-[12px] leading-relaxed" style={{ background: 'var(--card-bg, #fff)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{item.answer}</pre>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] muted">掌握度</span>
                  {MASTERY.map((m, i) => (
                    <button key={m} className="btn sm !py-0 !text-[11px]"
                      style={(progress[item.id] || 0) === i ? { background: 'var(--accent, #ef7d3a)', color: '#fff', borderColor: 'transparent' } : undefined}
                      onClick={() => setMastery(item.id, i)}>{m}</button>
                  ))}
                  <a className="ml-auto text-[11px]" href={item.url} target="_blank" rel="noreferrer">牛客原题 ↗</a>
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !hint && <p className="muted py-6 text-center text-xs">没有题目，先同步一批</p>}
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] muted">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 上一页</button>
          <span>{page} / {pages}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页 →</button>
        </div>
      )}
    </div>
  );
}

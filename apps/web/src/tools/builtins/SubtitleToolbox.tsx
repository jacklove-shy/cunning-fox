import { useState } from 'react';
import { http } from '../../lib/api';
import { JobPanel, PathBrowser, useToolJob } from '../runtime';

interface Pair { sub: string; video: string; target: string; ok: boolean; reason?: string }

const OPS = [
  { id: 'rename', name: '按视频名批量改名', desc: '字幕与视频智能配对，改为同名（先预览确认）' },
  { id: 'srt2vtt', name: 'SRT → VTT', desc: '网页播放器认这个格式' },
  { id: 'vtt2srt', name: 'VTT → SRT', desc: '转回通用字幕格式' },
  { id: 'fix-encoding', name: '编码修复', desc: 'GBK/Big5 乱码 → UTF-8' },
  { id: 'shift', name: '时间轴移位', desc: '整体提前/延后 N 秒' },
] as const;

/** 字幕工具箱：本地目录 → 预览/参数 → 队列执行 */
export function SubtitleToolbox() {
  const { job, start, cancel, reset, busy, error } = useToolJob('subtitle');
  const [dir, setDir] = useState<string[]>([]);
  const [videoDir, setVideoDir] = useState<string[]>([]);
  const [op, setOp] = useState<string>('rename');
  const [shiftSec, setShiftSec] = useState(2);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [planErr, setPlanErr] = useState('');
  const [planning, setPlanning] = useState(false);

  const plan = async () => {
    if (!dir[0]) return;
    setPlanning(true); setPlanErr('');
    try {
      const r = await http.post<{ pairs: Pair[] }>('/toolkit/subtitle/plan-rename', {
        dir: dir[0],
        videoDir: videoDir[0] || undefined,
      });
      setPairs(r.pairs);
    } catch (e) { setPlanErr((e as Error).message); setPairs(null); } finally { setPlanning(false); }
  };

  const run = async () => {
    if (!dir[0]) return;
    if (op === 'rename') {
      if (!pairs?.some((p) => p.ok)) { setPlanErr('请先生成配对预览'); return; }
      await start({ op: 'rename', dir: dir[0], pairs: pairs.filter((p) => p.ok) }, '字幕批量改名');
    } else if (op === 'shift') {
      await start({ op: 'shift', dir: dir[0], shiftSeconds: shiftSec }, `字幕时间轴移位 ${shiftSec >= 0 ? '+' : ''}${shiftSec}s`);
    } else {
      await start({ op, dir: dir[0] }, OPS.find((o) => o.id === op)?.name || '字幕处理');
    }
  };

  const okCount = pairs?.filter((p) => p.ok).length || 0;

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <span className="text-xs font-semibold muted">1 · 选择字幕目录</span>
        <div className="mt-2">
          <PathBrowser value={dir} onChange={(v) => { setDir(v); setPairs(null); }} mode="dir" label="字幕目录" />
        </div>
        {op === 'rename' && (
          <div className="mt-3">
            <span className="text-xs font-semibold muted">视频目录（默认=字幕目录，分开选更灵活）</span>
            <div className="mt-2">
              <PathBrowser value={videoDir} onChange={setVideoDir} mode="dir" label="视频目录" />
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <span className="text-xs font-semibold muted">2 · 操作</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPS.map((o) => (
            <button key={o.id} className="rounded-lg p-2.5 text-left" onClick={() => { setOp(o.id); setPairs(null); }}
              style={{
                border: `1.5px solid ${op === o.id ? 'var(--accent, #ef7d3a)' : 'var(--line, #e5e7eb)'}`,
                background: op === o.id ? 'var(--chip-bg, #fff7ef)' : 'transparent',
              }}>
              <div className="text-[13px] font-semibold">{o.name}</div>
              <div className="muted mt-0.5 text-[11px] leading-relaxed">{o.desc}</div>
            </button>
          ))}
        </div>
        {op === 'shift' && (
          <label className="mt-3 flex items-center gap-2 text-xs muted">
            移位秒数（正=延后，负=提前）
            <input className="inp sm" style={{ width: 90 }} type="number" value={shiftSec} onChange={(e) => setShiftSec(+e.target.value)} />
          </label>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {op === 'rename' && <button className="btn" onClick={plan} disabled={!dir[0] || planning}>{planning ? '配对中…' : '生成配对预览'}</button>}
          <button className="btn primary" disabled={!dir[0] || busy || (op === 'rename' && !okCount)} onClick={run}>
            {busy ? '提交中…' : '开始处理'}
          </button>
          {op === 'rename' && <span className="text-[11px] muted">改名会先预览、确认后才落盘（复制到输出目录，原字幕不动）</span>}
        </div>
        {planErr && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{planErr}</p>}
      </div>

      {pairs && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold muted">配对预览（{okCount}/{pairs.length} 可匹配）</span>
            <span className="ml-auto flex gap-2">
              <button className="btn sm" onClick={() => setPairs(pairs.map((p) => (p.ok ? p : { ...p, ok: true, reason: '手动强制' })))}>全部强制匹配</button>
            </span>
          </div>
          <div className="grid gap-1" style={{ maxHeight: 280, overflow: 'auto' }}>
            {pairs.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-[12px]"
                style={{ background: p.ok ? 'var(--chip-bg, #f6f7f9)' : 'transparent', opacity: p.ok ? 1 : 0.55 }}>
                <span className={p.ok ? '' : 'line-through'} style={{ maxWidth: '38%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sub.split(/[\\/]/).pop()}</span>
                <span className="muted">→</span>
                <span style={{ maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ok ? p.target.split(/[\\/]/).pop() : '✗ ' + (p.reason || '未匹配')}</span>
                <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] muted">
                  <input type="checkbox" checked={p.ok} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} />
                  采用
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <JobPanel job={job} onCancel={cancel} onReset={reset} />

      <p className="text-[11px] muted">
        说明：SRT/VTT 互转会合并多行字幕块；编码修复自动识别 GBK/Big5；所有结果写入「字幕处理_操作_时间戳」输出目录，原文件不动。
      </p>
    </div>
  );
}

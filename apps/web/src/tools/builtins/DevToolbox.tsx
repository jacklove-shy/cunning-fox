import { useMemo, useState } from 'react';

/* ============ 工具函数 ============ */

const bytesOf = (s: string) => new TextEncoder().encode(s);
const hexOf = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function b64encode(s: string) {
  const b = bytesOf(s);
  let out = '';
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(out);
}
function b64decode(s: string) {
  const bin = atob(s.replace(/\s/g, ''));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}
const hexEncode = (s: string) => hexOf(bytesOf(s).buffer as ArrayBuffer);
const hexEncode2 = (s: string) =>
  [...bytesOf(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
function hexDecode(h: string) {
  const clean = h.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2) throw new Error('十六进制长度必须是偶数');
  const b = new Uint8Array(clean.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(b);
}
const unicodeEscape = (s: string) =>
  [...s].map((c) => (c.codePointAt(0)! > 127 ? '\\u' + c.codePointAt(0)!.toString(16).padStart(4, '0') : c)).join('');

interface Rgb { r: number; g: number; b: number }
function parseColor(s: string): Rgb | null {
  const v = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = /^#?([0-9a-f]{6})$/.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  m = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/.exec(v);
  if (m) return hslToRgb(+m[1], +m[2], +m[3]);
  return null;
}
function rgbToHsl({ r, g, b }: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0));
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb(h: number, s: number, l: number): Rgb {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(255 * f(0)), g: Math.round(255 * f(8)), b: Math.round(255 * f(4)) };
}

const UNITS: Record<string, { label: string; items: [string, number][] }> = {
  长度: { label: '长度', items: [['米', 1], ['千米', 1000], ['厘米', 0.01], ['毫米', 0.001], ['英尺', 0.3048], ['英寸', 0.0254], ['英里', 1609.344]] },
  重量: { label: '重量', items: [['千克', 1], ['克', 0.001], ['吨', 1000], ['磅', 0.453592], ['盎司', 0.0283495]] },
  存储: { label: '存储', items: [['字节', 1], ['KB', 1024], ['MB', 1048576], ['GB', 1073741824], ['TB', 1099511627776]] },
  时间: { label: '时间', items: [['秒', 1], ['分钟', 60], ['小时', 3600], ['天', 86400], ['周', 604800]] },
};

/** 行级 LCS 差异 */
function diffLines(a: string[], b: string[]) {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { type: 'same' | 'del' | 'add'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
    else { out.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}

/* ============ 各面板 ============ */

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] muted">{title}</p>
      {children}
    </div>
  );
}

function EncodePane() {
  const [src, setSrc] = useState('Hello 中文 🎉');
  const [err, setErr] = useState('');
  const run = (fn: () => string) => {
    try { setErr(''); return fn(); } catch (e) { setErr((e as Error).message); return ''; }
  };
  const b64e = useMemo(() => run(() => b64encode(src)), [src]);
  const b64d = useMemo(() => run(() => b64decode(src)), [src]);
  const urle = useMemo(() => encodeURIComponent(src), [src]);
  const urld = useMemo(() => run(() => decodeURIComponent(src)), [src]);
  const hexe = useMemo(() => hexEncode2(src), [src]);
  const hexd = useMemo(() => run(() => hexDecode(src)), [src]);
  return (
    <div className="grid gap-4">
      <div>
        <textarea className="input min-h-[100px] font-mono text-xs" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="输入文本" />
        {err && <p className="mt-1 text-[11px]" style={{ color: 'var(--warn)' }}>{err}</p>}
      </div>
      {[
        ['Base64 编码', b64e],
        ['Base64 解码', b64d],
        ['URL 编码', urle],
        ['URL 解码', urld],
        ['Hex 编码', hexe],
        ['Hex 解码', hexd],
        ['Unicode 转义', unicodeEscape(src)],
      ].map(([label, val]) => (
        <div key={label as string}>
          <p className="mb-1 text-[11px] muted">{label}</p>
          <div className="rounded-lg border p-2.5 font-mono text-[12px] break-all" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>
            {val || '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimePane() {
  const [raw, setRaw] = useState(String(Math.floor(Date.now() / 1000)));
  const [now, setNow] = useState(Date.now());
  const n = Number(raw);
  const ms = raw.length > 10 ? n : n * 1000; // 自动识别秒/毫秒
  const valid = Number.isFinite(n) && n > 0;
  const d = valid ? new Date(ms) : null;
  const [dateStr, setDateStr] = useState('');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[11px] muted">时间戳（秒或毫秒自动识别）</p>
        <input className="input font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <div className="mt-3 space-y-1.5 text-[12px]">
          {d && !isNaN(d.getTime()) ? (
            <>
              <p>本地时间：<b>{d.toLocaleString('zh-CN', { hour12: false })}</b></p>
              <p className="muted font-mono">ISO：{d.toISOString()}</p>
              <p className="muted font-mono">UTC：{d.toUTCString()}</p>
              <p className="muted">毫秒：{ms} · 秒：{Math.floor(ms / 1000)}</p>
            </>
          ) : (
            <p className="muted">请输入有效时间戳</p>
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] muted">日期 → 时间戳</p>
        <input
          className="input font-mono text-xs"
          type="datetime-local"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
        />
        {dateStr && (
          <p className="mt-2 text-[12px]">
            秒：<b>{Math.floor(new Date(dateStr).getTime() / 1000)}</b> · 毫秒：<b>{new Date(dateStr).getTime()}</b>
          </p>
        )}
        <div className="mt-4">
          <button className="btn h-9 text-xs" onClick={() => setNow(Date.now())}>刷新当前时间</button>
          <p className="mt-2 text-[12px] muted">
            现在：{Math.floor(now / 1000)} （{new Date(now).toLocaleString('zh-CN', { hour12: false })}）
          </p>
        </div>
      </div>
    </div>
  );
}

function HashPane() {
  const [src, setSrc] = useState('hello world');
  const [out, setOut] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const calc = async () => {
    setBusy(true);
    const data = bytesOf(src);
    const res: Record<string, string> = {};
    for (const alg of ['SHA-1', 'SHA-256', 'SHA-512']) {
      try {
        const buf = await crypto.subtle.digest(alg, data as unknown as ArrayBuffer);
        res[alg] = hexOf(buf);
      } catch { res[alg] = '不支持'; }
    }
    setOut(res);
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <textarea className="input min-h-[90px] font-mono text-xs" value={src} onChange={(e) => setSrc(e.target.value)} />
      <div>
        <button className="btn btn-primary h-9 text-xs" onClick={calc} disabled={busy}>{busy ? '计算中…' : '计算摘要'}</button>
        <button
          className="btn h-9 text-xs ml-2"
          onClick={() => setOut({})}
        >
          清空
        </button>
      </div>
      {Object.entries(out).map(([k, v]) => (
        <div key={k}>
          <p className="mb-1 text-[11px] muted">{k}</p>
          <div className="rounded-lg border p-2.5 font-mono text-[11px] break-all" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function GenPane() {
  const [len, setLen] = useState(16);
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  const [digit, setDigit] = useState(true);
  const [symbol, setSymbol] = useState(false);
  const [pwd, setPwd] = useState('');
  const [uuids, setUuids] = useState<string[]>([]);
  const gen = () => {
    const pools = [
      lower ? 'abcdefghijkmnopqrstuvwxyz' : '',
      upper ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : '',
      digit ? '23456789' : '',
      symbol ? '!@#$%^&*()-_=+[]{}' : '',
    ].join('');
    if (!pools) { setPwd('请至少选择一种字符'); return; }
    const n = Math.max(4, Math.min(128, len));
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    setPwd([...buf].map((x) => pools[x % pools.length]).join(''));
  };
  const toggles: { label: string; val: boolean; set: (v: boolean) => void }[] = [
    { label: '小写', val: lower, set: setLower },
    { label: '大写', val: upper, set: setUpper },
    { label: '数字', val: digit, set: setDigit },
    { label: '符号', val: symbol, set: setSymbol },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] muted">随机密码</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input h-9 w-20 text-xs" type="number" value={len} onChange={(e) => setLen(+e.target.value)} />
          {toggles.map((t) => (
            <label key={t.label} className="flex items-center gap-1 text-[12px]">
              <input type="checkbox" checked={t.val} onChange={(e) => t.set(e.target.checked)} />
              {t.label}
            </label>
          ))}
          <button className="btn btn-primary h-9 text-xs" onClick={gen}>生成</button>
        </div>
        {pwd && (
          <div className="mt-3 rounded-lg border p-2.5 font-mono text-[12px] break-all" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>{pwd}</div>
        )}
      </div>
      <div>
        <p className="mb-2 text-[11px] muted">UUID v4</p>
        <button className="btn h-9 text-xs" onClick={() => setUuids(Array.from({ length: 5 }, () => crypto.randomUUID()))}>
          生成 5 个
        </button>
        <div className="mt-3 space-y-1">
          {uuids.map((u) => (
            <div key={u} className="rounded-lg border p-2 font-mono text-[11px]" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>{u}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorPane() {
  const [val, setVal] = useState('#ef7d3a');
  const rgb = useMemo(() => parseColor(val), [val]);
  const hsl = rgb ? rgbToHsl(rgb) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
      <div>
        <input className="input font-mono text-xs" value={val} onChange={(e) => setVal(e.target.value)} placeholder="#ef7d3a / rgb(1,2,3) / hsl(...)" />
        <div
          className="mt-3 h-24 rounded-xl border"
          style={{ background: rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : 'transparent', borderColor: 'var(--line)' }}
        />
      </div>
      <div className="space-y-1.5 text-[12px] font-mono">
        {rgb ? (
          <>
            <p>HEX：<b>#{[rgb.r, rgb.g, rgb.b].map((x) => x.toString(16).padStart(2, '0')).join('')}</b></p>
            <p>RGB：<b>rgb({rgb.r}, {rgb.g}, {rgb.b})</b></p>
            {hsl && <p>HSL：<b>hsl({hsl.h}, {hsl.s}%, {hsl.l}%)</b></p>}
            <p className="muted">十进制：{rgb.r}, {rgb.g}, {rgb.b}</p>
          </>
        ) : (
          <p className="muted">无法识别，试试 #ef7d3a / rgb(239,125,58) / hsl(24,84%,58%)</p>
        )}
      </div>
    </div>
  );
}

function RegexPane() {
  const [pattern, setPattern] = useState('\\d{3,4}');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('电话 010-12345678，手机 13800138000');
  const result = useMemo(() => {
    try {
      const re = new RegExp(pattern, flags);
      const hits: { m: string; i: number }[] = [];
      let m: RegExpExecArray | null;
      let guard = 0;
      if (flags.includes('g')) {
        while ((m = re.exec(text)) && guard++ < 500) {
          hits.push({ m: m[0], i: m.index });
          if (m[0] === '') re.lastIndex++;
        }
      } else {
        const one = re.exec(text);
        if (one) hits.push({ m: one[0], i: one.index });
      }
      return { ok: true as const, hits };
    } catch (e) {
      return { ok: false as const, err: (e as Error).message };
    }
  }, [pattern, flags, text]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs muted">/</span>
        <input className="input h-9 flex-1 font-mono text-xs" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="正则" />
        <span className="font-mono text-xs muted">/</span>
        <input className="input h-9 w-16 font-mono text-xs" value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="g" />
      </div>
      <textarea className="input min-h-[90px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      {result.ok ? (
        <div>
          <p className="mb-2 text-[11px] muted">命中 {result.hits.length} 处</p>
          <div className="flex flex-wrap gap-1.5">
            {result.hits.slice(0, 60).map((h, i) => (
              <span key={i} className="chip !py-0.5 font-mono text-[11px]">{h.m} <span className="opacity-60">@{h.i}</span></span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: 'var(--warn)' }}>正则无效：{result.err}</p>
      )}
    </div>
  );
}

function UnitPane() {
  const [kind, setKind] = useState('长度');
  const [from, setFrom] = useState('米');
  const [to, setTo] = useState('英尺');
  const [val, setVal] = useState('1');
  const items = UNITS[kind].items;
  const f = items.find((i) => i[0] === from)?.[1] ?? 1;
  const t = items.find((i) => i[0] === to)?.[1] ?? 1;
  const n = Number(val);
  const out = Number.isFinite(n) ? (n * f) / t : null;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div>
        <p className="mb-1 text-[11px] muted">类型</p>
        <select className="input h-9 text-xs" value={kind} onChange={(e) => { const k = e.target.value; setKind(k); setFrom(UNITS[k].items[0][0]); setTo(UNITS[k].items[1][0]); }}>
          {Object.keys(UNITS).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <p className="mb-1 text-[11px] muted">从</p>
          <select className="input h-9 w-24 text-xs" value={from} onChange={(e) => setFrom(e.target.value)}>
            {items.map(([n2]) => <option key={n2} value={n2}>{n2}</option>)}
          </select>
        </div>
        <span className="pb-2 muted">→</span>
        <div>
          <p className="mb-1 text-[11px] muted">到</p>
          <select className="input h-9 w-24 text-xs" value={to} onChange={(e) => setTo(e.target.value)}>
            {items.map(([n2]) => <option key={n2} value={n2}>{n2}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] muted">数值</p>
        <input className="input h-9 font-mono text-xs" value={val} onChange={(e) => setVal(e.target.value)} />
        <p className="mt-2 text-[13px]">
          {out !== null ? <><b>{Number(out.toPrecision(10))}</b> {to}</> : <span className="muted">请输入数字</span>}
        </p>
      </div>
    </div>
  );
}

function BasePane() {
  const [val, setVal] = useState('255');
  const n = parseInt(val.trim(), 10);
  const ok = Number.isFinite(n);
  return (
    <div className="grid gap-3">
      <input className="input font-mono text-xs" value={val} onChange={(e) => setVal(e.target.value)} placeholder="十进制数字" />
      {ok ? (
        <div className="grid gap-2 sm:grid-cols-3 text-[12px] font-mono">
          {[['二进制', 2], ['八进制', 8], ['十进制', 10], ['十六进制', 16], ['三十二进制', 32]].map(([label, b]) => (
            <div key={label as string} className="rounded-lg border p-2.5 break-all" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>
              <span className="text-[11px] muted">{label}</span>
              <br />
              <b>{n.toString(b as number)}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted text-xs">请输入十进制整数</p>
      )}
      <p className="text-[11px] muted">提示：要反方向转换，可先用编码面板把十六进制解码，或直接在上方输入对应进制的十进制值。</p>
    </div>
  );
}

function DiffPane() {
  const [a, setA] = useState('第一行\n第二行\n第三行');
  const [b, setB] = useState('第一行\n第二行改了\n新增一行');
  const rows = useMemo(() => diffLines(a.split('\n'), b.split('\n')), [a, b]);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <textarea className="input min-h-[120px] font-mono text-xs" value={a} onChange={(e) => setA(e.target.value)} placeholder="原文" />
        <textarea className="input min-h-[120px] font-mono text-xs" value={b} onChange={(e) => setB(e.target.value)} placeholder="新文" />
      </div>
      <div className="rounded-lg border font-mono text-[12px]" style={{ borderColor: 'var(--line)' }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="px-2.5 py-1"
            style={{
              background: r.type === 'del' ? 'color-mix(in srgb, var(--warn) 14%, transparent)' : r.type === 'add' ? 'color-mix(in srgb, var(--ok) 14%, transparent)' : undefined,
              color: r.type === 'del' ? 'var(--warn)' : r.type === 'add' ? 'var(--ok)' : undefined,
            }}
          >
            <span className="mr-2 opacity-70">{r.type === 'same' ? ' ' : r.type === 'del' ? '-' : '+'}</span>
            {r.text || ' '}
          </div>
        ))}
      </div>
      <p className="text-[11px] muted">
        {rows.filter((r) => r.type === 'add').length} 处新增 · {rows.filter((r) => r.type === 'del').length} 处删除
      </p>
    </div>
  );
}

const TABS = [
  { id: 'encode', name: '编码转换', el: <EncodePane /> },
  { id: 'time', name: '时间戳', el: <TimePane /> },
  { id: 'hash', name: '哈希摘要', el: <HashPane /> },
  { id: 'gen', name: '生成器', el: <GenPane /> },
  { id: 'color', name: '颜色转换', el: <ColorPane /> },
  { id: 'regex', name: '正则测试', el: <RegexPane /> },
  { id: 'unit', name: '单位换算', el: <UnitPane /> },
  { id: 'base', name: '进制转换', el: <BasePane /> },
  { id: 'diff', name: '文本对比', el: <DiffPane /> },
] as const;

export function DevToolbox() {
  const [tab, setTab] = useState<string>('encode');
  const cur = TABS.find((t) => t.id === tab) || TABS[0];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`chip ${t.id === tab ? 'chip-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <Pane title={cur.name}>{cur.el}</Pane>
      <p className="text-[11px] muted">
        全部在本机浏览器内计算，不上传任何内容；哈希使用浏览器 crypto.subtle（SHA-1/256/512）。
      </p>
    </div>
  );
}

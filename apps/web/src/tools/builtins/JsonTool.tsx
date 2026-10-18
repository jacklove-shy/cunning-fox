import { useMemo, useState } from 'react';

/** JSON 工具：格式化 / 压缩 / 转义 / 校验 / 统计 */
export function JsonTool() {
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  const [indent, setIndent] = useState(2);

  const stats = useMemo(() => {
    if (!out) return null;
    try {
      const v = JSON.parse(out);
      const count = (x: unknown): number => (x && typeof x === 'object' ? Object.keys(x as object).length : 0);
      return { keys: count(v), bytes: new Blob([out]).size, depth: depthOf(v) };
    } catch {
      return null;
    }
  }, [out]);

  const run = (fn: (v: unknown) => string) => {
    setErr('');
    try {
      const v = JSON.parse(src);
      setOut(fn(v));
    } catch (e) {
      setErr('不是合法 JSON：' + (e as Error).message);
      setOut('');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold muted">输入</span>
          <button className="btn sm" onClick={() => { setSrc(''); setOut(''); setErr(''); }}>清空</button>
        </div>
        <textarea
          className="inp font-mono"
          style={{ width: '100%', minHeight: 320, resize: 'vertical' }}
          placeholder='把 JSON 粘到这里，例如 {"name":"狐狸","tags":["前端","Node"]}'
          value={src}
          onChange={(e) => setSrc(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn primary sm" onClick={() => run((v) => JSON.stringify(v, null, indent))}>格式化</button>
          <button className="btn sm" onClick={() => run((v) => JSON.stringify(v))}>压缩</button>
          <button className="btn sm" onClick={() => run((v) => JSON.stringify(JSON.stringify(v)))}>转义为字符串</button>
          <button className="btn sm" onClick={() => { try { setOut(JSON.stringify(JSON.parse(src), null, indent)); setErr(''); } catch (e) { setErr((e as Error).message); } }}>去转义</button>
          <label className="ml-auto flex items-center gap-1 text-xs muted">
            缩进
            <select className="inp sm" value={indent} onChange={(e) => setIndent(+e.target.value)}>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={0}>Tab 风(2)</option>
            </select>
          </label>
        </div>
        {err && <p className="mt-2 text-xs" style={{ color: 'var(--danger, #e5484d)' }}>{err}</p>}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold muted">输出</span>
          <button className="btn sm" onClick={() => out && navigator.clipboard.writeText(out)}>复制</button>
        </div>
        <pre className="inp" style={{ width: '100%', minHeight: 320, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>
          {out || <span className="muted">结果会显示在这里</span>}
        </pre>
        {stats && (
          <p className="mt-2 text-[11px] muted">
            顶层键 {stats.keys} · 最大深度 {stats.depth} · {stats.bytes} 字节
          </p>
        )}
      </div>
    </div>
  );
}

function depthOf(v: unknown): number {
  if (!v || typeof v !== 'object') return 0;
  const vals = Object.values(v as object);
  if (!vals.length) return 1;
  return 1 + Math.max(...vals.map(depthOf));
}

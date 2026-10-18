import { useRef, useState, type MouseEvent } from 'react';

/** 网页标尺（简化版）：在测量区拖拽画框，实时显示宽高与间距 */
export function PageRuler() {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);
  const [last, setLast] = useState<{ w: number; h: number } | null>(null);

  const pos = (e: MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
  };

  const rect = start && cur
    ? { left: Math.min(start.x, cur.x), top: Math.min(start.y, cur.y), w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y) }
    : null;

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] muted">在下方区域按住鼠标拖拽，框选要测量的范围，松手后显示宽高（单位 px）。完整取色 / 元素识别在浏览器扩展版里。</p>
      <div
        ref={ref}
        onMouseDown={(e) => { const p = pos(e); setStart(p); setCur(p); }}
        onMouseMove={(e) => { if (start) setCur(pos(e)); }}
        onMouseUp={() => { if (rect) setLast({ w: rect.w, h: rect.h }); setStart(null); setCur(null); }}
        onMouseLeave={() => { setStart(null); setCur(null); }}
        style={{
          position: 'relative', height: 380, overflow: 'hidden', cursor: 'crosshair',
          backgroundColor: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 12,
          backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {rect && (
          <div style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.w, height: rect.h, border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}>
            <span style={{ position: 'absolute', top: -22, left: 0, fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              {rect.w} × {rect.h}
            </span>
          </div>
        )}
        {!rect && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
            按住拖拽开始测量
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="muted">上次测量：</span>
        {last ? <b style={{ color: 'var(--accent)' }}>{last.w} px × {last.h} px</b> : <span className="muted">—</span>}
      </div>
    </div>
  );
}

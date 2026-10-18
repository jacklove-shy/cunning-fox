import { useCallback, useEffect, useState } from 'react';

const N = 4;
type Grid = number[][];
const zeros = (): Grid => Array.from({ length: N }, () => Array(N).fill(0));
const transpose = (m: Grid): Grid => m[0].map((_, i) => m.map((r) => r[i]));
const same = (a: Grid, b: Grid) => JSON.stringify(a) === JSON.stringify(b);

function slide(row: number[]): { row: number[]; gained: number } {
  const a = row.filter(Boolean);
  let gained = 0;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a[i + 1] = 0; }
  }
  const b = a.filter(Boolean);
  while (b.length < N) b.push(0);
  return { row: b, gained };
}
function operate(g: Grid, dir: string): { grid: Grid; gained: number } {
  let work: Grid;
  if (dir === 'left') work = g.map((r) => [...r]);
  else if (dir === 'right') work = g.map((r) => [...r].reverse());
  else if (dir === 'up') work = transpose(g);
  else work = transpose(g).map((r) => [...r].reverse());
  let gained = 0;
  const res = work.map((r) => { const s = slide(r); gained += s.gained; return s.row; });
  let out: Grid;
  if (dir === 'left') out = res;
  else if (dir === 'right') out = res.map((r) => [...r].reverse());
  else if (dir === 'up') out = transpose(res);
  else out = transpose(res).map((r) => [...r].reverse());
  return { grid: out, gained };
}
function addTile(g: Grid): Grid {
  const z: [number, number][] = [];
  g.forEach((r, y) => r.forEach((v, x) => { if (!v) z.push([x, y]); }));
  if (!z.length) return g;
  const [x, y] = z[Math.floor(Math.random() * z.length)];
  const n = g.map((r) => [...r]);
  n[y][x] = Math.random() < 0.9 ? 2 : 4;
  return n;
}
const canMove = (g: Grid) =>
  g.some((r, y) => r.some((v, x) => !v || (x < N - 1 && v === r[x + 1]) || (y < N - 1 && v === g[y + 1][x])));

const TILE: Record<number, string> = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b',
  128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
};

interface State { grid: Grid; score: number; over: boolean }

export function Game2048() {
  const [s, setS] = useState<State>(() => ({ grid: addTile(addTile(zeros())), score: 0, over: false }));
  const [best, setBest] = useState(() => +(localStorage.getItem('fox-2048-best') || 0));

  const step = useCallback((dir: string) => {
    setS((prev) => {
      const { grid: ng, gained } = operate(prev.grid, dir);
      if (same(ng, prev.grid)) return prev;
      const withTile = addTile(ng);
      return { grid: withTile, score: prev.score + gained, over: !canMove(withTile) };
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
      if (!dir) return;
      e.preventDefault();
      if (!s.over) step(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, s.over]);

  useEffect(() => {
    if (s.score > best) { setBest(s.score); localStorage.setItem('fox-2048-best', String(s.score)); }
  }, [s.score, best]);

  const restart = () => setS({ grid: addTile(addTile(zeros())), score: 0, over: false });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-sm">分数 <b style={{ color: 'var(--accent)' }}>{s.score}</b></span>
        <span className="text-sm muted">最高 {best}</span>
        <button className="btn sm ml-auto" onClick={restart}>重新开始</button>
      </div>
      <div className="relative">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N},1fr)`, gap: 8, background: 'var(--panel2)', padding: 8, borderRadius: 12, border: '1px solid var(--line)' }}>
          {s.grid.flat().map((v, i) => (
            <div key={i} style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: 8, background: v ? (TILE[v] || '#3c3a32') : 'color-mix(in srgb, var(--line) 60%, transparent)', color: v > 4 ? '#fff' : '#776e65', fontWeight: 800, fontSize: v >= 1024 ? 18 : 22 }}>
              {v || ''}
            </div>
          ))}
        </div>
        {s.over && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--bg) 78%, transparent)', borderRadius: 12, fontWeight: 800 }}>游戏结束，点「重新开始」</div>}
      </div>
      <p className="text-[12.5px] muted">方向键 ↑ ↓ ← → 移动，相同数字相撞会合并，目标合成 2048。</p>
    </div>
  );
}

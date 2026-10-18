import { useCallback, useEffect, useRef, useState } from 'react';

const N = 18;
type Pt = { x: number; y: number };
interface G { snake: Pt[]; food: Pt; score: number; over: boolean }

const place = (s: Pt[]): Pt => {
  let p: Pt;
  do { p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
  while (s.some((q) => q.x === p.x && q.y === p.y));
  return p;
};
const initSnake: Pt[] = [{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }];

export function SnakeGame() {
  const [g, setG] = useState<G>({ snake: initSnake, food: place(initSnake), score: 0, over: false });
  const [running, setRunning] = useState(true);
  const [best, setBest] = useState(() => +(localStorage.getItem('fox-snake-best') || 0));
  const dirRef = useRef<Pt>({ x: 1, y: 0 });

  const tick = useCallback(() => {
    setG((prev) => {
      const h = prev.snake[0];
      const nh = { x: h.x + dirRef.current.x, y: h.y + dirRef.current.y };
      if (nh.x < 0 || nh.y < 0 || nh.x >= N || nh.y >= N || prev.snake.some((q) => q.x === nh.x && q.y === nh.y)) {
        setRunning(false);
        return { ...prev, over: true };
      }
      const eat = nh.x === prev.food.x && nh.y === prev.food.y;
      const ns = [nh, ...prev.snake];
      if (!eat) ns.pop();
      return { snake: ns, food: eat ? place(ns) : prev.food, score: prev.score + (eat ? 1 : 0), over: false };
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, 130);
    return () => clearInterval(id);
  }, [running, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = ({ ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } } as Record<string, Pt>)[e.key];
      if (!d) return;
      e.preventDefault();
      const c = dirRef.current;
      if (d.x === -c.x && d.y === -c.y) return;
      dirRef.current = d;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (g.score > best) { setBest(g.score); localStorage.setItem('fox-snake-best', String(g.score)); }
  }, [g.score, best]);

  const restart = () => { dirRef.current = { x: 1, y: 0 }; setG({ snake: initSnake, food: place(initSnake), score: 0, over: false }); setRunning(true); };

  const cell = (x: number, y: number) => {
    const head = g.snake[0];
    if (head.x === x && head.y === y) return 'var(--accent)';
    if (g.snake.some((q) => q.x === x && q.y === y)) return 'color-mix(in srgb, var(--accent) 55%, transparent)';
    if (g.food.x === x && g.food.y === y) return 'var(--warn, #f5a623)';
    return 'color-mix(in srgb, var(--line) 45%, transparent)';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <span className="text-sm">得分 <b style={{ color: 'var(--accent)' }}>{g.score}</b></span>
        <span className="text-sm muted">最高 {best}</span>
        <button className="btn sm ml-auto" onClick={restart}>重新开始</button>
      </div>
      <div className="relative">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N},1fr)`, gap: 1, background: 'var(--panel2)', padding: 6, borderRadius: 12, border: '1px solid var(--line)' }}>
          {Array.from({ length: N * N }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 3, background: cell(i % N, Math.floor(i / N)) }} />
          ))}
        </div>
        {g.over && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--bg) 78%, transparent)', borderRadius: 12, fontWeight: 800 }}>游戏结束，点「重新开始」</div>}
      </div>
      <p className="text-[12.5px] muted">方向键 ↑ ↓ ← → 控制，吃到金色食物变长，撞墙或撞到自己结束。</p>
    </div>
  );
}

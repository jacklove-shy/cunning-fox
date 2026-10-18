import { useEffect, useRef, useState, type ChangeEvent } from 'react';

const TEXT = '把重复的劳动交给程序，把判断留给自己。The quick brown fox jumps over the lazy dog.';

export function TypingTest() {
  const [val, setVal] = useState('');
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const endRef = useRef<number | null>(null);

  const chars = TEXT.split('');
  const typed = val.split('');
  const done = end !== null;
  const correct = typed.filter((c, i) => c === chars[i]).length;
  const errors = typed.length - correct;
  const seconds = start ? ((done ? end! : now) - start) / 1000 : 0;
  const cpm = seconds > 0.5 ? Math.round(correct / (seconds / 60)) : 0;
  const accuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;

  useEffect(() => {
    if (start && !done) { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }
  }, [start, done]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (done) return;
    const nv = e.target.value;
    if (nv.length > TEXT.length) return;
    if (start === null && nv.length === 1) setStart(Date.now());
    setVal(nv);
    if (nv.length === TEXT.length) { endRef.current = Date.now(); setEnd(Date.now()); }
  };
  const restart = () => { setVal(''); setStart(null); setEnd(null); setNow(0); endRef.current = null; };

  return (
    <div className="space-y-4">
      <div
        className="card"
        style={{ padding: '18px 20px', fontSize: 19, lineHeight: 2, letterSpacing: 0.5, fontFamily: 'ui-monospace,monospace' }}
      >
        {chars.map((c, i) => {
          const t = typed[i];
          const state = t === undefined ? 'idle' : t === c ? 'ok' : 'bad';
          const isCur = i === val.length && !done;
          return (
            <span
              key={i}
              style={{
                color: state === 'ok' ? 'var(--txt)' : state === 'bad' ? 'var(--danger, #e5484d)' : 'var(--muted)',
                background: state === 'bad' ? 'color-mix(in srgb, var(--danger, #e5484d) 18%, transparent)' : isCur ? 'var(--panel2)' : 'transparent',
                borderBottom: isCur ? '2px solid var(--accent)' : 'none',
                borderRadius: 3,
              }}
            >
              {c}
            </span>
          );
        })}
      </div>

      <input
        className="inp"
        style={{ width: '100%' }}
        placeholder={done ? '已完成，点下方重新开始' : '在这里输入上方文本开始计时…'}
        value={val}
        onChange={onChange}
        disabled={done}
        autoComplete="off"
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="muted">速度 <b style={{ color: 'var(--accent)' }}>{cpm}</b> 字/分</span>
        <span className="muted">准确率 <b style={{ color: errors ? 'var(--danger, #e5484d)' : 'var(--ok, #3ecf8e)' }}>{accuracy}%</b></span>
        <span className="muted">正确 <b>{correct}</b> · 错误 <b>{errors}</b></span>
        <span className="muted">用时 <b>{seconds.toFixed(1)}s</b></span>
        <button className="btn sm ml-auto" onClick={restart}>重新开始</button>
      </div>
    </div>
  );
}

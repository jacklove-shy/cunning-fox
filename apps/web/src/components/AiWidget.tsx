import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../lib/api';

interface Source {
  title: string;
  slug: string;
  summary: string;
}

interface Msg {
  role: 'me' | 'ai';
  text: string;
  sources?: Source[];
  mode?: 'llm' | 'search';
}

interface AskRes {
  mode: 'llm' | 'search';
  answer: string;
  sources: Source[];
}

/** 站内 AI 助手：右下角悬浮，基于文章内容回答（对齐小白龙的 ai-widget） */
export function AiWidget() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'ai', text: '你好，我是站内 AI 助手。可以问我站里文章相关的问题，我会基于文章内容回答。' },
  ]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs, open]);

  const ask = async () => {
    const text = q.trim();
    if (!text || busy) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'me', text }]);
    setBusy(true);
    try {
      const r = await http.post<AskRes>('/ai/ask', { q: text });
      setMsgs((m) => [...m, { role: 'ai', text: r.answer, sources: r.sources, mode: r.mode }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: '出错了：' + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 z-[70] flex w-[min(92vw,382px)] flex-col overflow-hidden rounded-2xl border shadow-2xl fade-up"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--panel)',
            maxHeight: 'min(70vh,560px)',
          }}
        >
          <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <span className="text-base">🤖</span>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">站内 AI 助手</p>
              <p className="text-[11px] muted">基于本站文章回答</p>
            </div>
            <button className="chip ml-auto !px-2 text-[11px]" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>

          <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'me' ? 'flex justify-end' : ''}>
                <div
                  className="max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[12.5px] leading-relaxed"
                  style={m.role === 'me' ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--panel2)' }}
                >
                  {m.text}
                  {m.role === 'ai' && m.mode === 'search' && (
                    <span className="mt-1 block text-[11px] opacity-70">检索模式</span>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                      <p className="text-[11px] muted">参考文章</p>
                      <ul className="mt-1 space-y-0.5">
                        {m.sources.map((s) => (
                          <li key={s.slug}>
                            <Link
                              to={`/posts/${s.slug}`}
                              className="text-[11px] transition hover:opacity-80"
                              style={{ color: 'var(--accent)' }}
                              onClick={() => setOpen(false)}
                            >
                              《{s.title}》
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-[12px] muted">思考中…</p>}
          </div>

          <div className="flex items-end gap-2 border-t p-3" style={{ borderColor: 'var(--line)' }}>
            <textarea
              className="input"
              style={{ minHeight: 40, maxHeight: 96, resize: 'none' }}
              placeholder="问点站内的事，比如「分页那个坑怎么修的」"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <button className="btn btn-primary h-9 shrink-0 text-xs" onClick={ask} disabled={busy}>
              发送
            </button>
          </div>
        </div>
      )}

      <button
        className="fixed bottom-5 right-4 z-[70] flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium text-white shadow-xl transition hover:opacity-90"
        style={{ background: 'var(--accent)' }}
        onClick={() => setOpen((v) => !v)}
        title="站内 AI 助手"
        aria-label="打开站内 AI 助手"
      >
        <span className="text-sm">🤖</span>
        <span className="hidden sm:inline">AI 助手</span>
      </button>
    </>
  );
}

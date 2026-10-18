import { useEffect, useState } from 'react';

interface Prompt {
  id: string;
  title: string;
  scene: string;
  body: string;
  createdAt: string;
}
const KEY = 'fox-prompt-vault-v1';

/** 提示词仓库：本地增删改查 + 搜索 + 一键复制（数据存 localStorage） */
export function PromptVault() {
  const [list, setList] = useState<Prompt[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  });
  const [kw, setKw] = useState('');
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [title, setTitle] = useState('');
  const [scene, setScene] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(list)); }, [list]);

  const reset = () => { setEditing(null); setTitle(''); setScene(''); setBody(''); };
  const save = () => {
    if (!title.trim() || !body.trim()) return;
    if (editing) {
      setList(list.map((p) => (p.id === editing.id ? { ...p, title, scene, body } : p)));
    } else {
      setList([{ id: 'pv_' + Date.now(), title, scene: scene || '通用', body, createdAt: new Date().toISOString() }, ...list]);
    }
    reset();
  };
  const shown = list.filter((p) => `${p.title} ${p.scene} ${p.body}`.toLowerCase().includes(kw.toLowerCase()));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <input className="inp" placeholder="搜索标题 / 场景 / 内容…" value={kw} onChange={(e) => setKw(e.target.value)} />
        {shown.length === 0 && <div className="card empty">还没有提示词，右侧新建一条吧。</div>}
        {shown.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{p.title}</h3>
                <p className="mt-0.5 text-[11px] muted">场景：{p.scene}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button className="btn sm" onClick={() => navigator.clipboard.writeText(p.body)}>复制</button>
                <button className="btn sm" onClick={() => { setEditing(p); setTitle(p.title); setScene(p.scene); setBody(p.body); }}>编辑</button>
                <button className="btn sm" onClick={() => setList(list.filter((x) => x.id !== p.id))}>删</button>
              </div>
            </div>
            <pre className="mt-3 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed muted" style={{ fontFamily: 'inherit' }}>{p.body}</pre>
          </div>
        ))}
      </div>

      <div className="card h-fit p-4">
        <p className="mb-3 text-xs font-semibold muted">{editing ? '编辑提示词' : '新建提示词'}</p>
        <input className="inp mb-2" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="inp mb-2" placeholder="场景（如：代码审查 / 文案改写）" value={scene} onChange={(e) => setScene(e.target.value)} />
        <textarea className="inp" style={{ width: '100%', minHeight: 200, resize: 'vertical' }} placeholder="提示词正文，可用 {变量} 占位" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="mt-3 flex gap-2">
          <button className="btn primary sm" onClick={save}>保存</button>
          {editing && <button className="btn sm" onClick={reset}>取消</button>}
        </div>
        <p className="mt-3 text-[11px] muted">数据存在浏览器本地（localStorage），换设备不同步；后期可切到 /api 持久化。</p>
      </div>
    </div>
  );
}

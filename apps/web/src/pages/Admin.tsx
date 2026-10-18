import { useCallback, useEffect, useState } from 'react';
import { fmtDate, http } from '../lib/api';
import { getSession, isAuthed, subscribe } from '../lib/auth';
import type { Paged, PostDetail, PostSummary, SiteMeta } from '../lib/types';

type Draft = {
  id?: string;
  title: string;
  slug: string;
  cat: string;
  tags: string;
  summary: string;
  content: string;
  status: 'draft' | 'published';
  pinned: boolean;
};

const EMPTY: Draft = {
  title: '',
  slug: '',
  cat: '前端',
  tags: '',
  summary: '',
  content: '',
  status: 'draft',
  pinned: false,
};

export default function Admin() {
  const [session, setSession] = useState(() => getSession());
  const [list, setList] = useState<PostSummary[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [kw, setKw] = useState('');

  useEffect(() => subscribe(() => setSession(getSession())), []);
  const isAdmin = isAuthed() && session?.role === 'admin';

  const refresh = useCallback(async () => {
    try {
      const d = await http.get<Paged<PostSummary>>('/posts?status=all&size=50&sort=new');
      setList(d.items);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    refresh();
    http.get<SiteMeta>('/meta').then((m) => setCats(m.postCats)).catch(() => setCats(['前端', '后端', 'AI', '工程化', '踩坑', '项目复盘']));
  }, [refresh]);

  const openEdit = async (slugOrId: string) => {
    try {
      const p = await http.get<PostDetail>(`/posts/${encodeURIComponent(slugOrId)}`);
      setDraft({
        id: p.id,
        title: p.title,
        slug: p.slug,
        cat: p.cat,
        tags: p.tags.join(', '),
        summary: p.summary,
        content: p.content,
        status: p.status,
        pinned: !!p.pinned,
      });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setMsg({ type: 'err', text: '标题不能为空' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const body = {
      title: draft.title,
      slug: draft.slug || undefined,
      cat: draft.cat,
      tags: draft.tags,
      summary: draft.summary,
      content: draft.content,
      status: draft.status,
      pinned: draft.pinned,
    };
    try {
      if (draft.id) await http.patch(`/posts/${draft.id}`, body);
      else await http.post('/posts', body);
      setMsg({ type: 'ok', text: '已保存' });
      setDraft(null);
      refresh();
      } catch (e) {
        setMsg({ type: 'err', text: (e as Error).message + '（请确认已用管理员账号在右上角登录）' });
      } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PostSummary) => {
    if (!confirm(`删除《${p.title}》？不可恢复。`)) return;
    try {
      await http.del(`/posts/${p.id}`);
      setMsg({ type: 'ok', text: '已删除' });
      if (draft?.id === p.id) setDraft(null);
      refresh();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  };

  const rows = list.filter((p) => !kw.trim() || `${p.title} ${p.cat} ${p.tags.join(' ')}`.toLowerCase().includes(kw.trim().toLowerCase()));

  if (!isAdmin) {
    return (
      <div className="wrap pt-16">
        <div className="card mx-auto max-w-md p-8 text-center">
          <p className="text-3xl">🔒</p>
          <h1 className="mt-3 text-xl font-bold">需要管理员登录</h1>
          <p className="mt-2 text-sm muted">内容管理仅对管理员开放。请点击页面右上角的「登录」，用管理员账号登录后刷新本页。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">admin</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">内容管理</h1>
          <p className="mt-2 text-sm muted">写文章、改分类、存草稿。写操作需要右上角登录的管理员身份。</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary h-9 text-xs" onClick={() => setDraft({ ...EMPTY })} disabled={!isAdmin}>
            + 新建文章
          </button>
        </div>
      </header>

      {msg && (
        <div
          className="card mt-5 px-4 py-3 text-xs"
          style={{
            borderColor: msg.type === 'ok' ? 'color-mix(in srgb, var(--ok) 45%, var(--line))' : 'color-mix(in srgb, var(--warn) 55%, var(--line))',
            color: msg.type === 'ok' ? 'var(--ok)' : 'var(--warn)',
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* 列表 */}
        <div className="card flex max-h-[70vh] flex-col overflow-hidden">
          <div className="border-b p-3" style={{ borderColor: 'var(--line)' }}>
            <input className="input h-9 text-xs" placeholder="筛选标题 / 分类 / 标签" value={kw} onChange={(e) => setKw(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 && <p className="p-6 text-center text-xs muted">暂无文章</p>}
            {rows.map((p) => (
              <button
                key={p.id}
                onClick={() => openEdit(p.slug)}
                className={`block w-full border-b px-4 py-3 text-left transition hover:bg-[var(--panel2)] ${draft?.id === p.id ? 'bg-[var(--panel2)]' : ''}`}
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="chip !py-0.5 text-[11px]">{p.cat}</span>
                  {p.status === 'draft' && <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>草稿</span>}
                  {p.pinned && <span className="text-[11px]" style={{ color: 'var(--accent)' }}>置顶</span>}
                </div>
                <p className="mt-1.5 truncate text-[13px] font-medium">{p.title}</p>
                <p className="mt-1 text-[11px] muted">{fmtDate(p.createdAt)} · {p.views} 阅读</p>
              </button>
            ))}
          </div>
        </div>

        {/* 编辑器 */}
        <div className="card p-5">
          {!draft ? (
            <div className="grid h-full min-h-[320px] place-items-center text-center">
              <div>
                <p className="text-3xl">✍️</p>
                <p className="mt-3 text-sm font-medium">选一篇改，或者新建一篇</p>
                <p className="mt-1 text-xs muted">正文支持 Markdown</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] muted">标题 *</span>
                  <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] muted">slug（留空自动生成）</span>
                  <input className="input" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] muted">分类</span>
                  <select className="input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })}>
                    {cats.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] muted">标签（逗号分隔）</span>
                  <input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[11px] muted">摘要</span>
                <input className="input" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] muted">正文（Markdown）</span>
                <textarea
                  className="input min-h-[280px] font-mono text-[12.5px] leading-relaxed"
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="input h-9 w-auto text-xs"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}
                >
                  <option value="draft">存为草稿</option>
                  <option value="published">发布</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs muted">
                  <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
                  置顶
                </label>
                <div className="ml-auto flex gap-2">
                  <button className="btn h-9 text-xs" onClick={() => setDraft(null)}>取消</button>
                  <button className="btn btn-primary h-9 text-xs" disabled={busy} onClick={save}>
                    {busy ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>

              {draft.id && (
                <button
                  className="text-[11px] transition hover:opacity-80"
                  style={{ color: 'var(--warn)' }}
                  onClick={() => {
                    const hit = list.find((p) => p.id === draft.id);
                    if (hit) remove(hit);
                  }}
                >
                  删除这篇文章
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

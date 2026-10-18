import { Link } from 'react-router-dom';
import { fmtDate, fmtNum, useApi } from '../lib/api';
import type { Comment, Paged, PostSummary, SiteMeta } from '../lib/types';
import { FoxMark } from './ui';

/**
 * 右侧聚合栏（对齐小白龙：热门文章 / 最新留言 / 标签 / 关于）。
 * 桌面端 sticky 跟随，移动端自然堆叠。
 */
export function Sidebar() {
  const { data: hot } = useApi<Paged<PostSummary>>('/posts?sort=views&size=5');
  const { data: comments } = useApi<{ items: Comment[]; total: number }>('/comments');
  const { data: meta } = useApi<SiteMeta>('/meta');
  const { data: facets } = useApi<{ tags: Record<string, number>; total: number }>('/posts/facets');

  const tags = Object.entries(facets?.tags || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
      {/* 热门文章 */}
      <section className="card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <span>🔥</span>
          <span>热门文章</span>
        </h3>
        <ol className="mt-3 space-y-2.5">
          {(hot?.items || []).map((p, i) => (
            <li key={p.id}>
              <Link to={`/posts/${p.slug}`} className="group flex items-start gap-2.5">
                <span
                  className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded text-[11px] font-bold tabular-nums"
                  style={{
                    background: i < 3 ? 'var(--accent)' : 'var(--panel2)',
                    color: i < 3 ? '#fff' : 'var(--muted)',
                  }}
                >
                  {i + 1}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug transition group-hover:text-[var(--accent)]">
                  {p.title}
                </span>
                <span className="ml-auto shrink-0 text-[11px] tabular-nums muted">{fmtNum(p.views)}</span>
              </Link>
            </li>
          ))}
          {!hot && <li className="text-[11px] muted">加载中…</li>}
          {hot && !hot.items.length && <li className="text-[11px] muted">还没有文章</li>}
        </ol>
      </section>

      {/* 最新留言 */}
      <section className="card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <span>💬</span>
          <span>最新留言</span>
        </h3>
        <ul className="mt-3 space-y-2.5">
          {(comments?.items || []).slice(0, 5).map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
              >
                {c.avatar || '🦊'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{c.nick}</p>
                <p className="line-clamp-1 text-[11px] muted">{c.content}</p>
              </div>
              <span className="shrink-0 text-[11px] muted">{fmtDate(c.createdAt)}</span>
            </li>
          ))}
          {!comments && <li className="text-[11px] muted">加载中…</li>}
          {comments && !comments.items.length && <li className="text-[11px] muted">还没有留言</li>}
        </ul>
        <Link to="/guestbook" className="mt-3 inline-block text-[11px]" style={{ color: 'var(--accent)' }}>
          去留言板 →
        </Link>
      </section>

      {/* 标签 */}
      {tags.length > 0 && (
        <section className="card p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <span>🏷</span>
            <span>标签</span>
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map(([t, n]) => (
              <Link key={t} to={`/posts?q=${encodeURIComponent(t)}`} className="chip text-[11px]">
                {t}
                <span className="ml-1 opacity-60 tabular-nums">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 关于 */}
      <section className="card p-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: '#fff4ec', border: '1px solid rgba(239,125,58,0.35)' }}
          >
            <FoxMark size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{meta?.site?.name || '一只狡猾的狐狸'}</p>
            <p className="truncate text-[11px] muted">{meta?.site?.author || 'personal bazaar'}</p>
          </div>
        </div>
        <p className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed muted">
          {meta?.site?.desc || '技术笔记、能直接用的工具、以及做过的东西。'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link to="/about" className="chip text-[11px]">关于</Link>
          <Link to="/archives" className="chip text-[11px]">归档</Link>
          <Link to="/friends" className="chip text-[11px]">友链</Link>
          <Link to="/donate" className="chip text-[11px]">赞赏</Link>
          <a href="/feed.xml" className="chip text-[11px]" target="_blank" rel="noreferrer">
            RSS
          </a>
        </div>
      </section>
    </aside>
  );
}

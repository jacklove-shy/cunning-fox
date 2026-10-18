import { Link } from 'react-router-dom';
import { fmtDate, useApi } from '../lib/api';
import type { ArchiveGroup } from '../lib/types';
import { Skel } from '../components/ui';

export default function Archives() {
  const { data, loading } = useApi<{ groups: ArchiveGroup[]; total: number }>('/archives');

  return (
    <div className="wrap max-w-3xl pt-10">
      <header className="mb-8">
        <p className="kicker">archives</p>
        <h1 className="mt-3 h1">归档</h1>
        <p className="mt-2 text-sm muted">按时间回溯所有文章{data ? ` · 共 ${data.total} 篇` : ''}。</p>
      </header>

      {loading ? (
        <Skel rows={5} h={64} />
      ) : (
        <div className="space-y-9">
          {(data?.groups || []).map((g) => (
            <section key={g.month}>
              <h2 className="mb-2 flex items-center gap-3 text-sm font-bold">
                <span>{g.month}</span>
                <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
                <span className="muted">{g.posts.length} 篇</span>
              </h2>
              <ul className="space-y-0.5">
                {g.posts.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/posts/${p.slug}`}
                      className="group flex items-baseline gap-3 rounded-lg px-2 py-2 transition hover:bg-[var(--panel2)]"
                    >
                      <span className="w-12 shrink-0 text-[11px] muted">{fmtDate(p.createdAt).slice(5)}</span>
                      <span className="truncate text-[13.5px] transition group-hover:text-[var(--accent)]">{p.title}</span>
                      {p.pinned && <span className="chip !py-0 shrink-0 text-[11px]" style={{ color: 'var(--warn)' }}>置顶</span>}
                      <span className="ml-auto shrink-0 text-[11px] muted">{p.cat}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {data && !data.groups.length && <div className="card empty">还没有文章。</div>}
        </div>
      )}
    </div>
  );
}

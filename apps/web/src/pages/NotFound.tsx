import { Link, useLocation } from 'react-router-dom';
import { fmtNum, useApi } from '../lib/api';
import type { Paged, PostSummary } from '../lib/types';

/** 404：对齐小白龙——说明路径、给三个去处、顺手推荐几篇文章 */
export default function NotFound() {
  const loc = useLocation();
  const { data } = useApi<Paged<PostSummary>>('/posts?size=3');
  const posts = data?.items || [];

  return (
    <div className="wrap max-w-3xl pt-16">
      <div className="text-center">
        <p className="text-6xl font-black grad-text">404</p>
        <h1 className="mt-3 text-lg font-bold">这一格空着</h1>
        <p className="mt-2 text-sm muted">页面不存在，或者还没建出来。</p>
        <p className="mt-1.5 text-[12px] muted">
          你找的是 <span className="chip !px-1.5 !py-0 text-[11px]">{loc.pathname}</span>
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/" className="btn btn-primary h-9 text-xs">回首页</Link>
          <Link to="/tools" className="btn h-9 text-xs">逛工具集市</Link>
          <Link to="/posts" className="btn h-9 text-xs">看全部文章</Link>
        </div>
      </div>

      {posts.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] muted">也许你想看</h2>
          <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
            {posts.map((p) => (
              <Link
                key={p.id}
                to={`/posts/${p.slug}`}
                className="flex items-center gap-3 border-b px-4 py-3 transition last:border-0 hover:bg-[var(--panel2)]"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="chip shrink-0 !py-0.5 text-[11px]">{p.cat}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.title}</span>
                <span className="shrink-0 text-[11px] tabular-nums muted">{fmtNum(p.views)} 阅读</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

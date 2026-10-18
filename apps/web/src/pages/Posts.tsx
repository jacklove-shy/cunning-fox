import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { qs, useApi } from '../lib/api';
import type { Paged, PostSummary, SiteMeta } from '../lib/types';
import { Empty, Pager, Skel } from '../components/ui';
import { PostRow } from '../components/PostRow';
import { Sidebar } from '../components/Sidebar';

const PAGE_SIZE = 10;

export default function Posts() {
  const [sp, setSp] = useSearchParams();
  const cat = sp.get('cat') || 'all';
  const q = sp.get('q') || '';
  const page = Math.max(1, Number(sp.get('page') || 1));

  const [kw, setKw] = useState(q);
  const { data: meta } = useApi<SiteMeta>('/meta');
  const path = useMemo(() => `/posts${qs({ cat, q, page, size: PAGE_SIZE })}`, [cat, q, page]);
  const { data, loading } = useApi<Paged<PostSummary>>(path);

  useEffect(() => setKw(q), [q]);

  const patch = (next: Record<string, string | number | undefined>) => {
    const merged: Record<string, string> = {};
    const base: Record<string, string | undefined> = { cat, q, page: String(page), ...next };
    for (const [k, v] of Object.entries(base)) {
      if (v && v !== 'all' && !(k === 'page' && v === '1')) merged[k] = String(v);
    }
    setSp(merged);
  };

  // 搜索防抖：输入停止 350ms 后写入 URL（同时回第 1 页）
  useEffect(() => {
    if (kw === q) return;
    const t = setTimeout(() => patch({ q: kw.trim(), page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw]);

  const cats = meta?.postCats || [];
  const counts = meta?.facets?.postCats || {};
  const total = meta?.facets ? Object.values(meta.facets.postCats).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="wrap pt-10">
      <header className="max-w-2xl border-b pb-6" style={{ borderColor: 'var(--line)' }}>
        <p className="kicker">notes &amp; essays</p>
        <h1 className="mt-2.5 h1">博客</h1>
        <p className="mt-2 lede">
          写下来的才算真的懂了。这里有方案对比、踩坑记录和项目复盘，全部是可复现的经验。
        </p>
      </header>

      <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {/* 筛选栏 */}
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`chip transition ${cat === 'all' ? 'chip-active' : ''}`}
                onClick={() => patch({ cat: 'all', page: 1 })}
              >
                全部 <span className="ml-1 opacity-70 tabular-nums">{total}</span>
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  className={`chip transition ${cat === c ? 'chip-active' : ''}`}
                  onClick={() => patch({ cat: c, page: 1 })}
                >
                  {c}
                  {counts[c] ? <span className="ml-1 opacity-70 tabular-nums">{counts[c]}</span> : null}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-sm">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs muted">🔍</span>
                <input
                  className="input pl-8"
                  placeholder="搜标题、标签、正文关键词…"
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                />
              </div>
              {(q || cat !== 'all') && (
                <button
                  className="btn h-9 text-xs"
                  onClick={() => {
                    setKw('');
                    setSp({});
                  }}
                >
                  清空筛选
                </button>
              )}
              <span className="text-xs muted">
                {data ? `命中 ${data.total} 篇` : loading ? '检索中…' : ''}
              </span>
            </div>
          </div>

          {/* 列表：行式，信息密度更高 */}
          <div className="mt-5">
            {loading ? (
              <Skel rows={5} h={96} />
            ) : !data || data.items.length === 0 ? (
              <Empty text="没有匹配的文章" hint="换个关键词或分类试试" />
            ) : (
              <div>
                {data.items.map((p) => (
                  <PostRow key={p.id} post={p} />
                ))}
              </div>
            )}
          </div>

          {data && data.items.length > 0 && (
            <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={(p) => patch({ page: p })} />
          )}
        </div>

        <Sidebar />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { http } from '../../lib/api';

/** 影视聚合搜索：iTunes 电影 + TVMaze 剧集，后端聚合去重 */
interface VideoItem {
  id: string; title: string; year: string; type: 'movie' | 'tv';
  genres: string[]; rating: number | null; poster: string | null; overview: string;
  country: string; duration?: string; sources: { name: string; url: string }[];
}

const TYPE_TABS: { id: 'all' | 'movie' | 'tv'; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'movie', label: '电影' }, { id: 'tv', label: '剧集' },
];

export function VideoSearch() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'movie' | 'tv'>('all');
  const [sort, setSort] = useState<'relevance' | 'year' | 'rating'>('relevance');
  const [items, setItems] = useState<VideoItem[] | null>(null);
  const [stat, setStat] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const run = async (kw = q, t = type, s = sort) => {
    if (!kw.trim()) return;
    setLoading(true); setErr('');
    try {
      const r = await http.get<{ items: VideoItem[]; sourceStat: Record<string, number> }>(
        `/toolkit/search/videos?q=${encodeURIComponent(kw.trim())}&type=${t}&sort=${s}`);
      setItems(r.items);
      setStat(r.sourceStat);
    } catch (e) {
      setErr((e as Error).message);
      setItems(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input className="inp flex-1" style={{ minWidth: 220 }} placeholder="搜电影 / 剧集，如：星际穿越、流浪地球、The Office"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }} />
          <button className="btn primary" onClick={() => run()} disabled={loading}>{loading ? '搜索中…' : '搜索'}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {TYPE_TABS.map((t) => (
              <button key={t.id} className="btn sm" style={type === t.id ? { background: 'var(--accent, #ef7d3a)', color: '#fff', borderColor: 'transparent' } : undefined}
                onClick={() => { setType(t.id); if (q.trim()) run(q, t.id, sort); }}>{t.label}</button>
            ))}
          </div>
          <select className="inp sm ml-auto" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); if (q.trim()) run(q, type, e.target.value as typeof sort); }}>
            <option value="relevance">按相关度</option>
            <option value="year">按年份</option>
            <option value="rating">按评分</option>
          </select>
        </div>
        {err && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{err}</p>}
        {items && (
          <p className="mt-2 text-[11px] muted">
            共 {items.length} 条（iTunes 电影 {stat.itunes ?? 0} · TVMaze 剧集 {stat.tvmaze ?? 0}，已按标题+年份去重合并）· 数据来自公开接口，只做索引不存储
          </p>
        )}
      </div>

      {items?.length === 0 && <div className="card empty">没有找到相关影片，换个关键词试试（电影可试英文名）。</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((v) => (
          <div key={v.id} className="card flex gap-3 p-3">
            <div className="shrink-0" style={{ width: 84 }}>
              {v.poster
                ? <img src={v.poster} alt={v.title} className="w-full rounded" style={{ aspectRatio: '2/3', objectFit: 'cover' }} loading="lazy" />
                : <div className="muted flex items-center justify-center rounded text-[11px]" style={{ aspectRatio: '2/3', background: 'var(--chip-bg, #f6f7f9)' }}>无海报</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1">
                <h3 className="text-[13px] font-semibold leading-snug">{v.title}</h3>
                <span className="chip !py-0 shrink-0 !text-[11px]">{v.type === 'movie' ? '电影' : '剧集'}</span>
              </div>
              <p className="muted mt-0.5 text-[11px]">
                {v.year || '年份未知'}{v.duration ? ' · ' + v.duration : ''}{v.country ? ' · ' + v.country : ''}
                {v.rating != null && <span style={{ color: '#f59e0b' }}> · ★ {v.rating.toFixed(1)}</span>}
              </p>
              {v.genres.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {v.genres.slice(0, 3).map((g) => <span key={g} className="chip !py-0 !text-[11px]">{g}</span>)}
                </p>
              )}
              {v.overview && <p className="muted mt-1 text-[11px] leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.overview}</p>}
              <p className="mt-1.5 flex flex-wrap gap-2">
                {v.sources.map((s) => (
                  <a key={s.name} className="text-[11px]" href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a>
                ))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

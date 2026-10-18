import { useMemo, useState } from 'react';
import { useApi } from '../lib/api';
import type { SiteMeta, Tool } from '../lib/types';
import { Empty, Skel, ToolCard } from '../components/ui';

export default function Tools() {
  const [cat, setCat] = useState('all');
  const [kw, setKw] = useState('');
  const [onlyHot, setOnlyHot] = useState(false);

  const { data: meta } = useApi<SiteMeta>('/meta');
  const path = useMemo(() => {
    const sp = new URLSearchParams();
    if (cat !== 'all') sp.set('cat', cat);
    if (onlyHot) sp.set('hot', '1');
    return `/tools${sp.toString() ? `?${sp}` : ''}`;
  }, [cat, onlyHot]);
  const { data, loading } = useApi<{ items: Tool[]; total: number; cats: Record<string, number> }>(path);

  const rows = (data?.items || []).filter((t) => {
    if (!kw.trim()) return true;
    const k = kw.trim().toLowerCase();
    return `${t.name} ${t.desc} ${t.tags.join(' ')}`.toLowerCase().includes(k);
  });

  const cats = meta?.toolCats || [];
  const counts = data?.cats || {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="wrap pt-12">
      <header className="max-w-2xl">
        <p className="kicker">tool bazaar</p>
        <h1 className="mt-3 h1">工具集市</h1>
        <p className="mt-3 lede">
          影视工具、去水印、浏览器插件、小游戏、开发工具、AI 效率——自己写的和自己在用的，都摆在这儿。
        </p>
      </header>

      <div className="mt-9 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button className={`chip ${cat === 'all' ? 'chip-active' : ''}`} onClick={() => setCat('all')}>
            全部 <span className="ml-1 opacity-70">{totalAll}</span>
          </button>
          {cats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'chip-active' : ''}`} onClick={() => setCat(c)}>
              {c}
              {counts[c] ? <span className="ml-1 opacity-70">{counts[c]}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs muted">🔍</span>
            <input className="input pl-8" placeholder="搜工具名、用途、标签…" value={kw} onChange={(e) => setKw(e.target.value)} />
          </div>
          <button className={`btn h-9 text-xs ${onlyHot ? 'btn-primary' : ''}`} onClick={() => setOnlyHot((v) => !v)}>
            🔥 只看热门
          </button>
          <span className="text-xs muted">{loading ? '加载中…' : `${rows.length} 个工具`}</span>
        </div>
      </div>

      <div className="mt-7">
        {loading ? (
          <Skel rows={3} h={120} />
        ) : rows.length === 0 ? (
          <Empty text="这个分类还空着" hint="换个分类，或者把关键词清掉" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        )}
      </div>

      <div className="card mt-10 flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
        <span className="text-2xl">📦</span>
        <p className="text-sm leading-relaxed muted">
          这个集市还在扩建。下一步会接入在线可用版本：图片去水印直接在浏览器里跑，小游戏直接开玩，插件给安装包。
        </p>
      </div>
    </div>
  );
}

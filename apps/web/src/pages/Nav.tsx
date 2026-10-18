import { useMemo, useState } from 'react';
import { useApi } from '../lib/api';
import { Skel } from '../components/ui';

interface NavItem {
  name: string;
  desc: string;
  url: string;
  /** 本地托管的站点 favicon，如 /logos/github.com.ico；缺失时回退首字母头像 */
  logo?: string;
}
interface NavCat {
  name: string;
  items: NavItem[];
}
interface NavData {
  kicker?: string;
  title?: string;
  intro?: string;
  cats: NavCat[];
}

/** 用站点名首字生成一个稳定的颜色；作为 favicon 抓取失败时的回退头像 */
function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function Nav() {
  const { data, loading } = useApi<NavData | null>('/nav');
  const [kw, setKw] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  const cats = data?.cats || [];
  const total = cats.reduce((s, c) => s + c.items.length, 0);

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return cats
      .filter((c) => !cat || c.name === cat)
      .map((c) => ({
        name: c.name,
        items: c.items.filter(
          (i) => !k || `${i.name} ${i.desc} ${i.url}`.toLowerCase().includes(k),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [cats, kw, cat]);

  const shown = filtered.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="wrap pt-10">
      <header className="mb-7 max-w-2xl">
        <p className="kicker">bookmarks</p>
        <h1 className="mt-3 h1">{data?.title || '导航'}</h1>
        <p className="mt-2 lede">
          {data?.intro || '常用网站与工具收录。'}共 {cats.length} 个分类 · {total} 条链接。
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs muted">🔍</span>
          <input
            className="input pl-8"
            placeholder="搜站名、用途或网址…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
        </div>
        <span className="text-xs muted">{kw || cat ? `命中 ${shown} 条` : `${total} 条`}</span>
        {(kw || cat) && (
          <button
            className="btn h-9 text-xs"
            onClick={() => {
              setKw('');
              setCat(null);
            }}
          >
            清空筛选
          </button>
        )}
      </div>

      {/* 分类筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          className={`chip ${cat === null ? 'chip-active' : ''}`}
          onClick={() => setCat(null)}
        >
          全部 <span className="ml-1 opacity-70">{total}</span>
        </button>
        {cats.map((c) => (
          <button
            key={c.name}
            className={`chip ${cat === c.name ? 'chip-active' : ''}`}
            onClick={() => setCat(c.name === cat ? null : c.name)}
          >
            {c.name} <span className="ml-1 opacity-70">{c.items.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Skel rows={6} h={72} />
      ) : (
        <div className="space-y-8">
          {filtered.map((c) => (
            <section key={c.name}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-base font-bold tracking-tight">{c.name}</h2>
                <span className="text-[11px] muted">{c.items.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {c.items.map((i) => (
                  <a
                    key={i.url}
                    href={i.url}
                    target="_blank"
                    rel="noreferrer"
                    className="card card-hover flex min-w-0 items-start gap-2.5 p-3.5"
                    title={i.desc || i.name}
                  >
                    <span className="relative h-8 w-8 shrink-0">
                      <span
                        className="absolute inset-0 grid place-items-center rounded-lg text-[13px] font-bold"
                        style={{
                          background: `hsl(${hue(i.name)} 70% 92%)`,
                          color: `hsl(${hue(i.name)} 65% 32%)`,
                        }}
                      >
                        {i.name.slice(0, 1)}
                      </span>
                      {i.logo && (
                        <img
                          src={i.logo}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-8 w-8 rounded-lg bg-white object-contain"
                          onError={(e) => e.currentTarget.remove()}
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium leading-snug">{i.name}</p>
                      {i.desc && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed muted">{i.desc}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] muted">↗</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
          {!filtered.length && <div className="card empty">没有匹配的链接，换个关键词试试。</div>}
        </div>
      )}
    </div>
  );
}

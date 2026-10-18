/* ============================================================
 * videosearch.ts — 影视聚合搜索（合法公开数据源）
 *  - iTunes Search API（电影：多 store 查询后按 kind=feature-movie 过滤）
 *  - TVMaze API（剧集：评分 / 类型 / 首播 / 海报）
 *  - 归一化去重后合并返回；只做检索索引，不存储任何片源
 * ============================================================ */

export interface VideoItem {
  id: string;
  title: string;
  originalTitle?: string;
  year: string;
  type: 'movie' | 'tv';
  genres: string[];
  rating: number | null;
  poster: string | null;
  overview: string;
  country: string;
  duration?: string;
  sources: { name: string; url: string }[];
}

interface ItunesMovie {
  trackName: string;
  kind?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  country?: string;
  artworkUrl100?: string;
  longDescription?: string;
  trackViewUrl?: string;
  trackTimeMillis?: number;
  collectionName?: string;
}

interface MazeShow {
  id: number;
  name: string;
  url: string;
  genres?: string[];
  premiered?: string;
  ended?: string | null;
  rating?: { average: number | null };
  image?: { medium?: string; original?: string } | null;
  summary?: string;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  language?: string;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' };

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s?: string): string {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function normKey(title: string, year: string): string {
  return (title + '|' + year).toLowerCase().replace(/[\s:：·・,，.。!！?？'"]/g, '');
}

async function searchItunes(q: string): Promise<VideoItem[]> {
  // media=movie 参数在当前网络环境下返回空，改为不过滤 + 客户端按 kind 过滤
  const stores = ['US', 'HK'];
  const all: ItunesMovie[] = [];
  await Promise.all(
    stores.map(async (country) => {
      try {
        const d = await getJson<{ results?: ItunesMovie[] }>(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&limit=25&country=${country}`,
        );
        for (const r of d.results || []) {
          if (r.kind === 'feature-movie') all.push(r);
        }
      } catch { /* 单源失败不影响其他源 */ }
    }),
  );
  return all.map((r, i) => ({
    id: 'itunes_' + i + '_' + (r.trackName || '').slice(0, 10),
    title: r.trackName,
    year: (r.releaseDate || '').slice(0, 4),
    type: 'movie' as const,
    genres: r.primaryGenreName ? [r.primaryGenreName] : [],
    rating: null,
    poster: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '600x600') : null,
    overview: stripHtml(r.longDescription).slice(0, 220),
    country: r.country || '',
    duration: r.trackTimeMillis ? `${Math.round(r.trackTimeMillis / 60000)} 分钟` : undefined,
    sources: [{ name: 'iTunes', url: r.trackViewUrl || 'https://tv.apple.com' }],
  }));
}

async function searchTvmaze(q: string): Promise<VideoItem[]> {
  let rows: { show: MazeShow }[] = [];
  try {
    rows = await getJson<{ show: MazeShow }[]>(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  } catch {
    return [];
  }
  return rows.map(({ show: s }) => ({
    id: 'tvmaze_' + s.id,
    title: s.name,
    year: (s.premiered || '').slice(0, 4),
    type: 'tv' as const,
    genres: s.genres || [],
    rating: s.rating?.average ?? null,
    poster: s.image?.medium || s.image?.original || null,
    overview: stripHtml(s.summary).slice(0, 220),
    country: s.network?.name || s.webChannel?.name || s.language || '',
    duration: s.ended ? `${s.premiered?.slice(0, 4)}–${s.ended.slice(0, 4)}` : s.premiered ? `${s.premiered.slice(0, 4)}– 连载` : undefined,
    sources: [{ name: 'TVMaze', url: s.url }],
  }));
}

export interface SearchOpts {
  type?: 'all' | 'movie' | 'tv';
  yearFrom?: number;
  yearTo?: number;
  sort?: 'relevance' | 'year' | 'rating';
}

/** 聚合搜索：并行多源 → 去重合并 → 过滤排序 */
export async function searchVideos(q: string, opts: SearchOpts = {}): Promise<{ items: VideoItem[]; sourceStat: Record<string, number> }> {
  const kw = q.trim();
  if (!kw) return { items: [], sourceStat: {} };
  const [movies, shows] = await Promise.all([searchItunes(kw), searchTvmaze(kw)]);
  const sourceStat: Record<string, number> = { itunes: movies.length, tvmaze: shows.length };

  const merged: VideoItem[] = [];
  const byKey = new Map<string, VideoItem>();
  for (const item of [...movies, ...shows]) {
    const key = normKey(item.title, item.year);
    const hit = byKey.get(key);
    if (hit) {
      // 合并：保留信息更全的字段
      if (!hit.poster && item.poster) hit.poster = item.poster;
      if (hit.rating == null && item.rating != null) hit.rating = item.rating;
      if (item.overview.length > hit.overview.length) hit.overview = item.overview;
      if (item.genres.length && !hit.genres.length) hit.genres = item.genres;
      for (const s of item.sources) if (!hit.sources.some((x) => x.name === s.name)) hit.sources.push(s);
    } else {
      byKey.set(key, item);
      merged.push(item);
    }
  }

  let items = merged;
  if (opts.type && opts.type !== 'all') items = items.filter((i) => i.type === opts.type);
  if (opts.yearFrom) items = items.filter((i) => +i.year >= opts.yearFrom!);
  if (opts.yearTo) items = items.filter((i) => +i.year && +i.year <= opts.yearTo!);
  if (opts.sort === 'year') items = [...items].sort((a, b) => +b.year - +a.year);
  else if (opts.sort === 'rating') items = [...items].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  else {
    // 相关度：标题命中优先，其次剧集（带评分）优先
    const low = kw.toLowerCase();
    items = [...items].sort((a, b) => {
      const ah = a.title.toLowerCase().includes(low) ? 1 : 0;
      const bh = b.title.toLowerCase().includes(low) ? 1 : 0;
      return bh - ah || (b.rating ?? -1) - (a.rating ?? -1);
    });
  }
  return { items: items.slice(0, 40), sourceStat };
}

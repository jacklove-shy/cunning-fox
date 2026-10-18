import { useApi } from '../lib/api';
import type { Friend } from '../lib/types';
import { Skel } from '../components/ui';

export default function Friends() {
  const { data, loading } = useApi<{ items: Friend[] }>('/friends');

  return (
    <div className="wrap max-w-4xl pt-10">
      <header className="mb-8">
        <p className="kicker">friends</p>
        <h1 className="mt-3 h1">友链</h1>
        <p className="mt-2 text-sm muted">常去的站点与参考对象。想交换友链，去留言板招呼一声即可。</p>
      </header>

      {loading ? (
        <Skel rows={3} h={108} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(data?.items || []).map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="card card-hover flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                {f.avatar || '🔗'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{f.name}</h3>
                  {f.tag && <span className="chip !py-0 text-[11px]">{f.tag}</span>}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed muted">{f.desc}</p>
              </div>
              <span className="ml-auto shrink-0 text-[11px]" style={{ color: 'var(--accent)' }}>↗</span>
            </a>
          ))}
          {data && !data.items.length && <div className="card empty">还没有友链。</div>}
        </div>
      )}
    </div>
  );
}

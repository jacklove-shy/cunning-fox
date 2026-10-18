import { Link } from 'react-router-dom';
import { useApi } from '../lib/api';

interface License {
  kicker?: string;
  title: string;
  tagline?: string;
  intro?: string;
  price?: number;
  currency?: string;
  priceNote?: string;
  deliverables?: string[];
  excludes?: string[];
  audience?: string[];
  faq?: { q: string; a: string }[];
  contact?: { wechat?: string; email?: string; note?: string };
}

/** 源码授权页：展示交付清单、定价、适用范围与联系入口（条款在 data/license.json） */
export default function LicensePage() {
  const { data, loading } = useApi<License | null>('/license');

  if (loading) return <div className="wrap pt-16 text-sm muted">加载中…</div>;
  if (!data) return <div className="wrap pt-16 text-sm muted">授权信息暂未配置</div>;

  const price = data.price ? new Intl.NumberFormat('zh-CN').format(data.price) : null;

  return (
    <div className="wrap max-w-3xl pt-10">
      <header className="border-b pb-7" style={{ borderColor: 'var(--line)' }}>
        <p className="kicker">{data.kicker || 'license'}</p>
        <h1 className="mt-2.5 h1">{data.title}</h1>
        {data.tagline && <p className="mt-2 text-sm muted">{data.tagline}</p>}
      </header>

      {/* 价格卡 */}
      <div
        className="card mt-7 flex flex-wrap items-end justify-between gap-4 p-6"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--panel)), var(--panel))',
        }}
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] muted">授权定价</p>
          <p className="mt-1 text-3xl font-black tabular-nums">
            {price ? `¥${price}` : '面议'}
            <span className="ml-2 align-middle text-[11px] font-normal muted">{data.priceNote}</span>
          </p>
        </div>
        <Link to="/guestbook" className="btn btn-primary h-10 px-5">咨询 / 留言</Link>
      </div>

      {data.intro && <p className="mt-5 lede">{data.intro}</p>}

      {/* 交付清单 */}
      {data.deliverables?.length ? (
        <section className="mt-9">
          <h2 className="text-[15px] font-bold">交付清单</h2>
          <ul className="mt-3 space-y-2">
            {data.deliverables.map((d) => (
              <li key={d} className="flex gap-2.5 text-[13px] leading-relaxed">
                <span style={{ color: 'var(--ok, #3ecf8e)' }}>✓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 不包含 */}
      {data.excludes?.length ? (
        <section className="mt-7">
          <h2 className="text-[15px] font-bold">不包含</h2>
          <ul className="mt-3 space-y-2">
            {data.excludes.map((d) => (
              <li key={d} className="flex gap-2.5 text-[13px] leading-relaxed muted">
                <span>—</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 适合谁 */}
      {data.audience?.length ? (
        <section className="mt-9">
          <h2 className="text-[15px] font-bold">适合谁</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.audience.map((d) => (
              <li key={d} className="card p-3.5 text-[12.5px] leading-relaxed">{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* FAQ */}
      {data.faq?.length ? (
        <section className="mt-9">
          <h2 className="text-[15px] font-bold">常见问题</h2>
          <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
            {data.faq.map((f) => (
              <details key={f.q} className="border-b px-4 py-3 last:border-0" style={{ borderColor: 'var(--line)' }}>
                <summary className="cursor-pointer select-none text-[13px] font-medium">{f.q}</summary>
                <p className="mt-2 text-[12.5px] leading-relaxed muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* 联系方式 */}
      <section className="mt-9">
        <h2 className="text-[15px] font-bold">怎么联系</h2>
        <div className="card mt-3 p-4 text-[13px] leading-relaxed">
          {data.contact?.wechat ? (
            <p>
              微信：<b>{data.contact.wechat}</b>
            </p>
          ) : null}
          {data.contact?.email ? (
            <p className={data.contact?.wechat ? 'mt-1' : ''}>
              邮箱：<b>{data.contact.email}</b>
            </p>
          ) : null}
          {data.contact?.note ? <p className="mt-2 text-[12px] muted">{data.contact.note}</p> : null}
        </div>
      </section>
    </div>
  );
}

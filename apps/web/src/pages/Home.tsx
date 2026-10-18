import { Link } from 'react-router-dom';
import { useApi, CONSOLE_URL } from '../lib/api';
import type { Paged, PostSummary, SiteMeta, Stats, Tool } from '../lib/types';
import { PostRow } from '../components/PostRow';
import { Sidebar } from '../components/Sidebar';
import { SectionHead, Skel, ToolCard } from '../components/ui';

/**
 * 首页（对齐小白龙的产品思路：内容优先）。
 * 头部只留品牌 + 一句话 + 数字 + 主入口，把首屏让给文章流；
 * 右侧聚合热门文章 / 最新留言 / 标签，像一座有人气的个人站。
 * 工具集市与中台作为「站内特色模块」下移保留。
 */
export default function Home() {
  const { data: stats } = useApi<Stats>('/stats');
  const { data: meta } = useApi<SiteMeta>('/meta');
  const { data: posts, loading: lp } = useApi<Paged<PostSummary>>('/posts?size=8');
  const { data: myProjects } = useApi<{ items: Tool[] }>(
    `/tools?cat=${encodeURIComponent('我的项目')}`
  );
  const { data: tools } = useApi<{ items: Tool[]; total: number }>('/tools');

  const hot = (tools?.items || []).filter((t) => t.hot).slice(0, 3);
  const more = (tools?.items || []).filter((t) => !t.hot).slice(0, 3);
  const toolShow = [...hot, ...more].slice(0, 6);

  const figures: [string, number | string][] = [
    ['文章', stats?.posts ?? '—'],
    ['工具', stats?.tools ?? '—'],
    ['阅读', stats?.views ?? '—'],
  ];

  return (
    <div className="wrap pt-10">
      {/* ===== 头部：品牌 + tagline + 数字 + 主入口（压缩，内容优先） ===== */}
      <header
        className="flex flex-col gap-6 border-b pb-7 md:flex-row md:items-end md:justify-between"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="max-w-2xl">
          <p className="kicker">share · build · explore</p>
          <h1 className="mt-2.5 text-[27px] font-black leading-tight tracking-tight md:text-[36px]">
            {meta?.site?.name || '一只狡猾的狐狸'}
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed muted">
            {meta?.site?.desc || '技术笔记、能直接用的工具、以及做过的东西。'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/posts" className="btn btn-primary h-9 px-4 text-xs">全部文章</Link>
            <Link to="/tools" className="btn h-9 px-4 text-xs">工具集市</Link>
            <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="btn h-9 px-4 text-xs">
              求职中台 ↗
            </a>
          </div>
        </div>

        <div className="flex shrink-0 gap-6">
          {figures.map(([label, v]) => (
            <div key={label} className="text-right">
              <p className="text-xl font-bold tabular-nums">{String(v)}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] muted">{label}</p>
            </div>
          ))}
        </div>
      </header>

      {/* ===== 主体：文章流 + 右侧聚合栏 ===== */}
      <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-tight">最新文章</h2>
            <Link to="/posts" className="inline-block py-1 text-[12px] transition hover:opacity-80" style={{ color: 'var(--accent)' }}>
              共 {stats?.posts ?? 0} 篇 →
            </Link>
          </div>

          {lp ? (
            <Skel rows={4} h={108} />
          ) : (
            <div>
              {(posts?.items || []).map((p) => (
                <PostRow key={p.id} post={p} />
              ))}
            </div>
          )}

          <div className="mt-6">
            <Link to="/posts" className="btn h-9 w-full text-xs">浏览全部文章 →</Link>
          </div>
        </section>

        <Sidebar />
      </div>

      {/* ===== 我的项目 ===== */}
      <section className="mt-16">
        <SectionHead
          kicker="selected work"
          title="我的项目"
          desc="不是玩具 Demo，是真的在跑、在用的东西。"
          right={<Link to="/tools" className="btn h-9 text-xs">全部项目 →</Link>}
        />
        {!myProjects ? (
          <Skel rows={2} h={180} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(myProjects.items || []).slice(0, 2).map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        )}
      </section>

      {/* ===== 工具集市 ===== */}
      <section className="mt-14">
        <SectionHead
          kicker="tool bazaar"
          title="工具集市"
          desc="自己写的、自己用的、觉得值得摆出来的。"
          right={<Link to="/tools" className="btn h-9 text-xs">逛全部 {tools?.total ?? ''} 个 →</Link>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {toolShow.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      {/* ===== 中台 CTA ===== */}
      <section className="mt-14">
        <div
          className="card relative overflow-hidden p-8 md:p-10"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--panel)), color-mix(in srgb, var(--accent2) 10%, var(--panel)))',
          }}
        >
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: 'var(--accent2)' }}
          />
          <div className="relative max-w-2xl">
            <p className="kicker">featured module</p>
            <h2 className="mt-3 text-2xl font-bold md:text-[28px]">求职自动化中台</h2>
            <p className="mt-3 text-sm leading-relaxed muted">
              自动扫岗、匹配打分、批量投递、看板跟踪，再用机器人把结果推到手机。它是这个站里最「重」的一个模块，
              也是我把找工作这件被动的事做成系统的尝试。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="btn btn-primary h-10 px-5">
                打开中台 ↗
              </a>
              <Link to="/posts/job-hunter-0-to-1" className="btn h-10 px-5">读它是怎么做的</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

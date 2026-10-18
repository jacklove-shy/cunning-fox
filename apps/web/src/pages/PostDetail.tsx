import { useState, useRef, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fmtDate, fmtNum, useApi } from '../lib/api';
import type { PostDetail, PostSummary } from '../lib/types';
import { Comments } from '../components/Comments';
import { PostCard, Skel } from '../components/ui';

/** 代码块：右上角「复制代码」按钮 */
function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = ref.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };
  return (
    <div className="codewrap">
      <button className="copybtn" onClick={copy} type="button">
        {copied ? '已复制' : '复制代码'}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

/** 标题 → 锚点 id（中文保留，其余转连字符），目录与正文标题共用同一套规则 */
function headingId(text: string): string {
  return (
    'h-' +
    text
      .trim()
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/** 从 Markdown 里抽取 h2/h3 生成目录 */
function extractToc(md: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].replace(/[`*_~]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
    if (!text) continue;
    out.push({ level: m[1].length, text, id: headingId(text) });
  }
  return out;
}

export default function PostPage() {
  const { slug = '' } = useParams();
  const { data, loading, error } = useApi<PostDetail>(`/posts/${encodeURIComponent(slug)}`);

  if (loading) {
    return (
      <div className="wrap max-w-3xl pt-12">
        <Skel rows={1} h={40} />
        <div className="mt-6">
          <Skel rows={5} h={26} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="wrap pt-24 text-center">
        <p className="text-4xl">🫥</p>
        <h1 className="mt-4 text-xl font-bold">文章不存在</h1>
        <p className="mt-2 text-sm muted">{error || '它可能被删掉或还没发布'}</p>
        <Link to="/posts" className="btn mt-6">← 回到博客列表</Link>
      </div>
    );
  }

  const toc = extractToc(data.content);

  const nav = (p?: PostSummary | null) =>
    p ? (
      <Link to={`/posts/${p.slug}`} className="card card-hover flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] muted">{p.slug === data.prev?.slug ? '← 上一篇' : '下一篇 →'}</span>
        <span className="truncate text-sm font-semibold">{p.title}</span>
      </Link>
    ) : (
      <span className="flex-1" />
    );

  return (
    <article className="wrap max-w-3xl pt-10">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-xs muted">
        <Link to="/" className="transition hover:text-[var(--txt)]">首页</Link>
        <span>/</span>
        <Link to="/posts" className="transition hover:text-[var(--txt)]">博客</Link>
        <span>/</span>
        <span className="truncate">{data.title}</span>
      </nav>

      <header className="mt-5 border-b pb-7" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Link
            to={`/posts?cat=${encodeURIComponent(data.cat)}`}
            className="chip !border-transparent"
            style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}
          >
            {data.cat}
          </Link>
          {data.pinned && <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>置顶</span>}
          <span className="muted">{fmtDate(data.createdAt)}</span>
          <span className="muted">·</span>
          <span className="muted tabular-nums">{fmtNum(data.views)} 阅读</span>
          <span className="muted">·</span>
          <span className="muted tabular-nums">{data.content.replace(/\s/g, '').length} 字</span>
        </div>
        <h1 className="mt-4 h1">{data.title}</h1>
        <p className="mt-4 lede">{data.summary}</p>
      </header>

      {/* 目录 */}
      {toc.length >= 2 && (
        <details className="card mt-6 p-4" open>
          <summary className="cursor-pointer select-none text-[13px] font-semibold">
            目录 <span className="ml-1 text-[11px] font-normal muted">{toc.length} 节</span>
          </summary>
          <ol className="mt-3 space-y-1.5">
            {toc.map((t) => (
              <li key={t.id} style={{ paddingLeft: (t.level - 2) * 14 }}>
                <a href={`#${t.id}`} className="text-[12.5px] muted transition hover:text-[var(--accent)]">
                  {t.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="prose mt-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: CodeBlock,
            h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>,
            h3: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
          }}
        >
          {data.content}
        </ReactMarkdown>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2 border-t pt-6" style={{ borderColor: 'var(--line)' }}>
        {data.tags.map((t) => (
          <Link key={t} to={`/posts?q=${encodeURIComponent(t)}`} className="chip">#{t}</Link>
        ))}
        <span className="ml-auto text-[11px] muted">最后更新 {fmtDate(data.updatedAt)}</span>
      </div>

      {/* 上一篇 / 下一篇 */}
      {(data.prev || data.next) && (
        <section className="mt-10 flex flex-col gap-3 sm:flex-row">
          {nav(data.prev)}
          {nav(data.next)}
        </section>
      )}

      {data.related && data.related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] muted">相关文章</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.related.slice(0, 2).map((p) => (
              <PostCard key={p.id} post={p} compact />
            ))}
          </div>
        </section>
      )}

      {/* 赞赏提示 */}
      <div className="card mt-10 flex flex-wrap items-center gap-3 p-4">
        <span className="text-lg">☕</span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium">觉得这篇有用？</p>
          <p className="text-[12px] muted">可以请我喝杯咖啡，或者分享给需要的人。</p>
        </div>
        <Link to="/donate" className="btn btn-primary ml-auto h-9 text-xs">去赞赏</Link>
      </div>

      {/* 评论区（与留言板同一组件，支持楼中楼回复） */}
      <Comments slug={data.slug} heading="评论" />
    </article>
  );
}

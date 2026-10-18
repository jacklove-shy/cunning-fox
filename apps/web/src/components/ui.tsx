import { Link } from 'react-router-dom';
import { fmtDate, fmtNum } from '../lib/api';
import type { PostSummary, Tool } from '../lib/types';
import { toolEdge, toolKind } from '../tools/registry';

/** 品牌标识：一只橙色几何狐狸（与 favicon.svg 同源设计） */
export function FoxMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      <polygon points="22,9 37,41 9,34" fill="#ef7d3a" />
      <polygon points="78,9 91,34 63,41" fill="#ef7d3a" />
      <polygon points="24,18 33,37 17,33" fill="#c85a1f" />
      <polygon points="76,18 83,33 67,37" fill="#c85a1f" />
      <path d="M19,34 Q50,29 81,34 L65,61 Q50,95 35,61 Z" fill="#f4904e" />
      <polygon points="50,57 37,69 63,69" fill="#fff7ef" />
      <polygon points="50,73 44,67 56,67" fill="#23252b" />
      <path d="M31,52 Q38,46 45,50 Q39,53 32,55 Z" fill="#23252b" />
      <path d="M69,52 Q62,46 55,50 Q61,53 68,55 Z" fill="#23252b" />
    </svg>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="py-6 text-center text-xs muted">共 {total} 条</p>;
  }
  const lo = Math.max(1, page - 2);
  const hi = Math.min(totalPages, page + 2);
  const pages: number[] = [];
  for (let i = lo; i <= hi; i++) pages.push(i);

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <button className="btn h-9 min-w-9 text-xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>
      {lo > 1 && (
        <>
          <button className="btn h-9 min-w-9 text-xs" onClick={() => onChange(1)}>1</button>
          {lo > 2 && <span className="px-1 text-xs muted">…</span>}
        </>
      )}
      {pages.map((i) => (
        <button
          key={i}
          className={`btn h-9 min-w-9 text-xs ${i === page ? 'btn-primary' : ''}`}
          onClick={() => onChange(i)}
        >
          {i}
        </button>
      ))}
      {hi < totalPages && (
        <>
          {hi < totalPages - 1 && <span className="px-1 text-xs muted">…</span>}
          <button className="btn h-9 min-w-9 text-xs" onClick={() => onChange(totalPages)}>{totalPages}</button>
        </>
      )}
      <button className="btn h-9 min-w-9 text-xs" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ›
      </button>
      <span className="ml-2 text-xs muted">共 {total} 条</span>
    </div>
  );
}

export function PostCard({ post, compact }: { post: PostSummary; compact?: boolean }) {
  return (
    <Link
      to={`/posts/${post.slug}`}
      className="card card-hover group flex flex-col gap-2.5 p-5"
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="chip !border-transparent" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
          {post.cat}
        </span>
        {post.pinned && <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>置顶</span>}
        <span className="muted ml-auto">{fmtDate(post.createdAt)}</span>
      </div>
      <h3 className="text-[15.5px] font-semibold leading-snug transition group-hover:text-[var(--accent)]">
        {post.title}
      </h3>
      <p className={`text-[13px] leading-relaxed muted ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{post.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] muted">
        <span>{post.wordCount} 字</span>
        <span>{fmtNum(post.views)} 阅读</span>
        <span className="ml-auto inline-flex gap-1.5">
          {post.tags.slice(0, 2).map((t) => (
            <span key={t} className="chip !py-0.5 text-[11px]">#{t}</span>
          ))}
        </span>
      </div>
    </Link>
  );
}

export function ToolCard({ tool }: { tool: Tool }) {
  const kind = toolKind(tool.slug);
  const edge = toolEdge(tool.slug);
  const ext = tool.url || tool.repo;
  const runtime = kind === 'builtin' || kind === 'soon'; // 走站内运行时页
  const action =
    kind === 'builtin' ? '打开工具 →' : kind === 'soon' ? '即将上线' : tool.to ? '查看 →' : ext ? '打开 ↗' : '';
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          {tool.icon || '🧰'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{tool.name}</h3>
            {tool.hot && <span className="chip !py-0 text-[11px]" style={{ color: 'var(--warn)' }}>HOT</span>}
            {kind === 'builtin' && <span className="chip !py-0 text-[11px]" style={{ color: 'var(--ok, #3ecf8e)' }}>可用</span>}
          </div>
          <p className="mt-0.5 text-[11px] muted">{tool.cat}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed muted">{tool.desc}</p>
      {edge && (
        <div className="mt-2.5">
          <span
            className="chip !py-0.5 text-[11px]"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--ok, #3ecf8e)' }}
          >
            {edge}
          </span>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {tool.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip !py-0.5 text-[11px]">{t}</span>
        ))}
        {action && (
          <span className="ml-auto text-[11px]" style={{ color: kind === 'soon' ? 'var(--muted)' : 'var(--accent)' }}>
            {action}
          </span>
        )}
      </div>
    </>
  );

  const cls = 'card card-hover flex h-full flex-col p-4';
  if (runtime) {
    return (
      <Link to={`/tools/${tool.slug}`} className={cls}>
        {inner}
      </Link>
    );
  }
  if (tool.to) {
    return (
      <Link to={tool.to} className={cls}>
        {inner}
      </Link>
    );
  }
  return ext ? (
    <a href={ext} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function SectionHead({
  kicker,
  title,
  desc,
  right,
}: {
  kicker?: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <p className="kicker mb-2">{kicker}</p>}
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
        {desc && <p className="mt-1.5 max-w-2xl text-sm muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Skel({ rows = 3, h = 92 }: { rows?: number; h?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk" style={{ height: h }} />
      ))}
    </div>
  );
}

export function Empty({ text = '这里还空着', hint }: { text?: string; hint?: string }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <p className="text-3xl">🫙</p>
      <p className="mt-3 text-sm font-medium">{text}</p>
      {hint && <p className="mt-1 text-xs muted">{hint}</p>}
    </div>
  );
}

/* ===== 线性图标（16px / stroke=currentColor）=====
   统一替换头部 emoji：🔍/☾/☰ 在各平台渲染不一（Windows 的 🔍 是彩色渐变），
   且彩色 emoji 与单色文本符号混用风格割裂。SVG 保证跨端一致、可随主题着色。 */
const ico = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
export function IconSearch() {
  return (
    <svg {...ico}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.2-4.2" />
    </svg>
  );
}
export function IconSun() {
  return (
    <svg {...ico}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2 12h2.5M19.5 12H22M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  );
}
export function IconMoon() {
  return (
    <svg {...ico}>
      <path d="M20.6 13.2A8.6 8.6 0 1 1 10.8 3.4a6.8 6.8 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
export function IconMenu() {
  return (
    <svg {...ico}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}
export function IconClose() {
  return (
    <svg {...ico}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

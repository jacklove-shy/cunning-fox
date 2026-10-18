import { Link } from 'react-router-dom';
import { fmtDate, fmtNum } from '../lib/api';
import type { PostSummary } from '../lib/types';

/**
 * 行式文章条目。
 * 对齐小白龙博客的列表范式：标题 / 摘要 / 分类 / 日期 / 阅读量，一行一篇、分隔线分割，
 * 信息密度比卡片网格高，首屏能看到更多文章。
 */
export function PostRow({ post }: { post: PostSummary }) {
  return (
    <Link
      to={`/posts/${post.slug}`}
      className="group flex flex-col gap-1.5 border-b py-5 transition last:border-0 last:pb-0 first:pt-0"
      style={{ borderColor: 'var(--line)' }}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className="chip !border-transparent !py-0.5 text-[11px]"
          style={{
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {post.cat}
        </span>
        {post.pinned && (
          <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>置顶</span>
        )}
        <span className="muted">{fmtDate(post.createdAt)}</span>
        <span className="muted">·</span>
        <span className="muted tabular-nums">{fmtNum(post.views)} 阅读</span>
        <span className="hidden muted sm:inline">·</span>
        <span className="hidden muted tabular-nums sm:inline">{post.wordCount} 字</span>
      </div>

      <h3 className="text-[16.5px] font-semibold leading-snug transition group-hover:text-[var(--accent)]">
        {post.title}
      </h3>

      <p className="line-clamp-2 text-[13px] leading-relaxed muted">{post.summary}</p>

      {post.tags.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {post.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip !py-0 text-[11px]">#{t}</span>
          ))}
        </div>
      )}
    </Link>
  );
}

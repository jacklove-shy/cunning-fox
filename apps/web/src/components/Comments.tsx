import { useEffect, useMemo, useState } from 'react';
import { http, useApi } from '../lib/api';
import { getSession, subscribe } from '../lib/auth';
import { AuthModal } from './AuthModal';
import { Skel } from './ui';
import type { Comment } from '../lib/types';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 评论区（留言板与文章共用）。
 * 对齐小白龙：未登录只显示「登录后即可留言」+ 登录/注册按钮；登录后才有输入框，
 * 发言自动带账号名；每条可回复，回复以缩进 + 「回复 @昵称」呈现。
 */
export function Comments({
  slug,
  heading = '评论',
}: {
  slug?: string;
  heading?: string;
}) {
  const path = slug ? `/comments?slug=${encodeURIComponent(slug)}` : '/comments';
  const { data, loading, setData } = useApi<{ items: Comment[]; total: number }>(path);

  const [session, setSession] = useState(getSession());
  useEffect(() => subscribe(() => setSession(getSession())), []);

  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [tip, setTip] = useState('');
  const [authOpen, setAuthOpen] = useState(false);

  const verb = heading === '留言' ? '留言' : '评论';

  /* 一级 + replies：接口返回平铺，前端按 parentId 分组 */
  const roots = useMemo(() => {
    const all = data?.items || [];
    const ids = new Set(all.map((c) => c.id));
    const kids = new Map<string, Comment[]>();
    const top: Comment[] = [];
    for (const c of all) {
      // 父评论已被删除时不能把回复丢掉：降级为一级评论照常展示
      if (c.parentId && ids.has(c.parentId)) {
        const arr = kids.get(c.parentId) || [];
        arr.push(c);
        kids.set(c.parentId, arr);
      } else {
        top.push(c);
      }
    }
    for (const arr of kids.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return top.map((c) => ({ root: c, replies: kids.get(c.id) || [] }));
  }, [data]);

  const submit = async () => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    if (!content.trim()) {
      setTip('写点什么再提交吧');
      return;
    }
    setSending(true);
    setTip('');
    try {
      const c = await http.post<Comment>('/comments', {
        ...(slug ? { slug } : {}),
        nick: session.username,
        content: content.trim(),
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      setData((prev) => (prev ? { ...prev, items: [c, ...prev.items], total: prev.total + 1 } : prev));
      setContent('');
      setTip(replyTo ? `已回复 @${replyTo.nick}` : '发布成功');
      setReplyTo(null);
    } catch (e) {
      setTip('提交失败：' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startReply = (root: Comment) => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    setReplyTo(root);
  };

  return (
    <section className="mt-10 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        {heading}
        <span className="text-[11px] font-normal muted tabular-nums">{data?.total ?? 0}</span>
      </h2>

      {/* 已登录：输入区 */}
      {session ? (
        <div className="card mt-4 p-4">
          {replyTo && (
            <div
              className="mb-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]"
              style={{ background: 'var(--panel2)', color: 'var(--muted)' }}
            >
              <span>
                回复 <b style={{ color: 'var(--accent)' }}>@{replyTo.nick}</b>
              </span>
              <button className="ml-auto inline-block py-1 text-[11px] hover:opacity-80" onClick={() => setReplyTo(null)}>
                取消
              </button>
            </div>
          )}

          <p className="mb-2.5 flex items-center gap-2 text-[12px] muted">
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {session.username.slice(0, 1).toUpperCase()}
            </span>
            以 <b style={{ color: 'var(--txt)' }}>{session.username}</b> 的身份{replyTo ? '回复' : '发言'}
          </p>

          <textarea
            className="input"
            style={{ width: '100%', minHeight: 88, resize: 'vertical' }}
            placeholder={replyTo ? `回复 @${replyTo.nick}…` : `说点什么…（登录身份：${session.username}）`}
            value={content}
            maxLength={2000}
            onChange={(e) => setContent(e.target.value)}
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary h-9 text-xs" onClick={submit} disabled={sending}>
              {sending ? '提交中…' : replyTo ? '发表回复' : '发表'}
            </button>
            {tip && <span className="text-[12px] muted">{tip}</span>}
          </div>
        </div>
      ) : (
        /* 未登录：登录门槛（对齐小白龙） */
        <div className="card mt-4 flex flex-wrap items-center gap-3 p-4">
          <span className="text-lg">💬</span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium">登录后即可{verb}</p>
            <p className="text-[12px] muted">和作者、其他读者交流，发言会自动带上你的用户名。</p>
          </div>
          <button className="btn btn-primary ml-auto h-9 text-xs" onClick={() => setAuthOpen(true)}>
            登录 / 注册
          </button>
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {/* 列表 */}
      {loading ? (
        <div className="mt-4">
          <Skel rows={2} h={72} />
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {roots.map(({ root, replies }) => (
            <li key={root.id}>
              <CommentItem c={root} onReply={() => startReply(root)} />
              {replies.length > 0 && (
                <ul
                  className="mt-2 space-y-2.5 border-l pl-3 sm:pl-4"
                  style={{ borderColor: 'var(--line)' }}
                >
                  {replies.map((r) => (
                    <li key={r.id}>
                      <CommentItem c={r} compact onReply={() => startReply(root)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {!roots.length && <li className="text-[12.5px] muted">还没有{heading}，来抢沙发。</li>}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  c,
  compact,
  onReply,
}: {
  c: Comment;
  compact?: boolean;
  onReply: () => void;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={`grid shrink-0 place-items-center rounded-full ${compact ? 'h-7 w-7 text-[13px]' : 'h-8 w-8 text-base'}`}
        style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
      >
        {c.avatar || c.nick.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[12.5px]">{c.nick}</b>
          {c.top && (
            <span className="chip !py-0 text-[11px]" style={{ color: 'var(--warn)' }}>置顶</span>
          )}
          {c.replyTo && (
            <span className="text-[11px] muted">
              回复 <span style={{ color: 'var(--accent)' }}>@{c.replyTo}</span>
            </span>
          )}
          <span className="ml-auto text-[11px] muted">{fmtTime(c.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{c.content}</p>
        <button
          className="mt-1 inline-block px-1.5 py-1 text-[11px] transition hover:opacity-80"
          style={{ color: 'var(--muted)' }}
          onClick={onReply}
        >
          回复
        </button>
      </div>
    </div>
  );
}

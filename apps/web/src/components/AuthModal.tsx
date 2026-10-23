import { useState } from 'react';
import { http } from '../lib/api';
import { setSession, type Session } from '../lib/auth';

export type AuthTab = 'login' | 'register';

/**
 * 登录 / 注册弹窗（对齐小白龙：一个弹窗、两个分段）。
 *
 * 取值方式：**FormData 直接读表单控件**，不用受控 state、也不用 ref。
 * 原因：Chrome 自动填充 / 密码管理器只改 DOM 的 value，不触发 React onChange；
 * 受控 state 会停在空值（框里明明有 admin，提交却说「必填」），ref 在某些重挂载场景也会读到空。
 * FormData 读的是提交那一刻 DOM 的真实值，最稳。
 */
export function AuthModal({
  onClose,
  defaultTab = 'login',
}: {
  onClose: () => void;
  defaultTab?: AuthTab;
}) {
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');

    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm-password') || '');

    if (!username || !password) {
      setErr('用户名和密码必填');
      return;
    }
    if (tab === 'register' && password !== confirm) {
      setErr('两次输入的密码不一致');
      return;
    }

    setBusy(true);
    try {
      const path = tab === 'login' ? '/auth/login' : '/auth/register';
      const r = await http.post<{ token: string; exp: number; username: string; role: Session['role'] }>(path, {
        username,
        password,
      });
      setSession({ token: r.token, username: r.username, role: r.role, exp: r.exp });
      onClose();
    } catch (e) {
      setErr((e as Error).message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-full max-w-sm overflow-hidden fade-up" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--line)' }}
        >
          <span className="text-sm font-semibold">{tab === 'login' ? '登录' : '注册'}</span>
          <button className="chip !px-2 text-[11px]" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="p-4">
          <p className="text-[12px] leading-relaxed muted">
            登录后可留言、评论、记录礼账，发言会自动带上你的用户名。
          </p>

          {/* 登录 / 注册 分段 */}
          <div className="mt-3 flex rounded-lg p-0.5" style={{ background: 'var(--panel2)' }}>
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setErr('');
                }}
                className="flex-1 rounded-md py-1.5 text-[12px] transition"
                style={
                  tab === t
                    ? { background: 'var(--panel)', fontWeight: 600 }
                    : { color: 'var(--muted)' }
                }
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {/* key={tab}：切换分段时表单重挂载，清掉上一段的输入 */}
          <form key={tab} onSubmit={submit} className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] muted">用户名</span>
              <input
                name="username"
                autoComplete="username"
                className="input"
                autoFocus
                defaultValue=""
                placeholder={tab === 'register' ? '2-20 位，字母 / 数字 / 中文' : 'admin'}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] muted">密码</span>
              <input
                name="password"
                type="password"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                className="input"
                defaultValue=""
                placeholder={tab === 'register' ? '至少 6 位' : '••••••'}
              />
            </label>
            {tab === 'register' && (
              <label className="block">
                <span className="mb-1.5 block text-[11px] muted">确认密码</span>
                <input
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  defaultValue=""
                  placeholder="再输一次"
                />
              </label>
            )}

            {err && <p className="text-[12px]" style={{ color: 'var(--warn)' }}>{err}</p>}

            <button className="btn btn-primary h-10 w-full text-sm" disabled={busy} type="submit">
              {busy ? '处理中…' : tab === 'login' ? '登录' : '注册并登录'}
            </button>

            <p className="text-center text-[11px] muted">
              {tab === 'login'
                ? '首次启动的管理员密码会打印在后端控制台（未配置时随机生成）'
                : '注册即为普通用户：可留言、评论，不能管理站点'}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

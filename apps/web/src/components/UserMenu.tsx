import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../lib/api';
import { getSession, isAuthed, logout, subscribe, type Session } from '../lib/auth';
import { AuthModal } from './AuthModal';

/** 订阅式读取当前会话，登录/退出/改密后自动刷新 */
function useSession(): Session | null {
  const [s, setS] = useState<Session | null>(getSession());
  useEffect(() => subscribe(() => setS(getSession())), []);
  // 启动时向服务端确认会话是否仍有效（改密 / 被删号 / 过期后本地会残留旧 Token）
  useEffect(() => {
    if (!getSession()) return;
    let live = true;
    http.get('/auth/me').catch(() => {
      if (live) setS(getSession()); // 401 时 api 层已 logout，这里同步刷新
    });
    return () => {
      live = false;
    };
  }, []);
  return s;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-full max-w-sm overflow-hidden fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold">{title}</span>
          <button className="chip !px-2 text-[11px]" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ChangePwModal({ onClose }: { onClose: () => void }) {
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setOk(false);
    try {
      await http.post('/auth/change-password', { oldPassword: oldP, newPassword: newP });
      setOk(true);
      setOldP('');
      setNewP('');
      setTimeout(onClose, 900);
    } catch (e) {
      setErr((e as Error).message || '修改失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="修改密码" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] muted">原密码</span>
          <input className="input" type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] muted">新密码（至少 6 位）</span>
          <input className="input" type="password" value={newP} onChange={(e) => setNewP(e.target.value)} />
        </label>
        {err && <p className="text-[12px]" style={{ color: 'var(--warn)' }}>{err}</p>}
        {ok && <p className="text-[12px]" style={{ color: 'var(--ok, #3ecf8e)' }}>密码已更新</p>}
        <button className="btn btn-primary h-10 w-full text-sm" disabled={busy} type="submit">
          {busy ? '保存中…' : '保存新密码'}
        </button>
      </form>
    </Modal>
  );
}

export function UserMenu() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const authed = isAuthed() && s;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-usermenu]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!authed) {
    return (
      <>
        <button
          className="btn hidden h-11 text-xs sm:inline-flex md:h-9"
          onClick={() => setAuthOpen(true)}
          title="登录 / 注册"
        >
          登录
        </button>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  return (
    <div className="relative" data-usermenu>
      <button
        className="btn hidden h-11 gap-2 px-2.5 text-xs sm:inline-flex md:h-9"
        onClick={() => setOpen((v) => !v)}
        title={s!.role === 'admin' ? '管理员' : '已登录用户'}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {s!.username.slice(0, 1).toUpperCase()}
        </span>
        {/* 用户名 xl(1280) 起才显示：lg~xl 只露头像+角色片，给 9 个导航项让位 */}
        <span className="hidden xl:inline">{s!.username}</span>
        <span className="chip !px-1.5 !py-0 text-[11px]">{s!.role === 'admin' ? '管理员' : '用户'}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border bg-[var(--panel)] shadow-2xl fade-up"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-2.5 border-b px-3 py-3" style={{ borderColor: 'var(--line)' }}>
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {s!.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{s!.username}</p>
              <p className="text-[11px] muted">{s!.role === 'admin' ? '管理员 · 全权限' : '用户 · 可留言'}</p>
            </div>
          </div>
          <div className="p-1.5">
            {s!.role === 'admin' && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--panel2)]"
                onClick={() => setOpen(false)}
              >
                🛠 内容管理
              </Link>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
              onClick={() => {
                setOpen(false);
                setPwOpen(true);
              }}
            >
              🔑 修改密码
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
              style={{ color: 'var(--warn)' }}
              onClick={() => {
                logout();
                setOpen(false);
              }}
            >
              ↩ 退出登录
            </button>
          </div>
        </div>
      )}

      {pwOpen && <ChangePwModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { http } from '../../../lib/api';
import { setSession, type Session } from '../../../lib/auth';

interface LoginResp {
  token: string;
  exp: number;
  username: string;
  role: 'admin' | 'user';
}

/**
 * 婚礼礼账本登录门槛。
 * 用 FormData 读表单控件（不用受控 state / ref）：
 * Chrome 自动填充只改 DOM value、不触发 onChange，受控 state 会读到空值。
 */
export function Login({ onOk }: { onOk: (s: Session) => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');

    if (!username || !password) {
      setErr('用户名和密码必填');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const r = await http.post<LoginResp>('/auth/login', { username, password });
      const s: Session = { token: r.token, username: r.username, role: r.role, exp: r.exp };
      setSession(s);
      onOk(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6" style={{ maxWidth: 380, margin: '0 auto' }}>
      <h3 className="text-base font-semibold">婚礼礼账本 · 登录</h3>
      <p className="muted mt-1 text-[11px] leading-relaxed">
        本地服务器模式，礼账含金额等隐私数据，需登录后查看与记账。
        首次使用：<b>admin / admin1234</b>，请在「账户」页尽快修改密码。
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="muted text-[11px]">用户名</span>
          <input
            name="username"
            autoComplete="username"
            className="input"
            autoFocus
            defaultValue=""
            placeholder="admin"
          />
        </label>
        <label className="grid gap-1">
          <span className="muted text-[11px]">密码</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="input"
            defaultValue=""
            placeholder="••••••••"
          />
        </label>
        {err && <span className="text-[12px]" style={{ color: '#e5484d' }}>{err}</span>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}

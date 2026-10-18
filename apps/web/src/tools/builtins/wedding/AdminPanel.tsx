import { useCallback, useEffect, useState } from 'react';
import { http } from '../../../lib/api';
import { getSession, logout } from '../../../lib/auth';

interface UserRow {
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
}

/** 账户管理（仅管理员可见）：改自己的密码、建用户、删用户、登出。 */
export function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const me = getSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadErr, setLoadErr] = useState('');

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const [nu, setNu] = useState('');
  const [npw, setNpw] = useState('');
  const [nrole, setNrole] = useState<'admin' | 'user'>('user');
  const [nuMsg, setNuMsg] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const d = await http.get<{ items: UserRow[] }>('/auth/users');
      setUsers(d.items || []);
      setLoadErr('');
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, []);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const changePw = async () => {
    setPwMsg('');
    try {
      await http.post('/auth/change-password', { oldPassword: oldPw, newPassword: newPw });
      setPwMsg('密码已修改，下次登录生效');
      setOldPw(''); setNewPw('');
    } catch (e) { setPwMsg('失败：' + (e as Error).message); }
  };

  const createUser = async () => {
    setNuMsg('');
    try {
      await http.post('/auth/users', { username: nu, password: npw, role: nrole });
      setNuMsg('已创建：' + nu);
      setNu(''); setNpw('');
      loadUsers();
    } catch (e) { setNuMsg('失败：' + (e as Error).message); }
  };

  const delUser = async (name: string) => {
    if (!confirm(`确认删除用户 ${name}？`)) return;
    try {
      await http.del(`/auth/users/${encodeURIComponent(name)}`);
      if (name === me?.username) { onLogout(); return; }
      loadUsers();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold muted">当前账户</span>
          <span className="text-[11px]">
            登录身份：<b>{me?.username}</b>（{me?.role === 'admin' ? '管理员' : '普通用户'}）
            <button className="btn sm ml-2" onClick={onLogout}>退出登录</button>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <span className="text-xs font-semibold muted">修改我的密码</span>
          <div className="mt-2 grid gap-2">
            <input className="input" type="password" placeholder="原密码" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
            <input className="input" type="password" placeholder="新密码（≥6 位）" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <button className="btn primary sm" onClick={changePw}>保存新密码</button>
            {pwMsg && <span className="text-[11px] muted">{pwMsg}</span>}
          </div>
        </div>

        <div className="card p-4">
          <span className="text-xs font-semibold muted">新建用户（分配给帮忙记账的家人/朋友）</span>
          <div className="mt-2 grid gap-2">
            <input className="input" placeholder="用户名（2-20 位，字母/数字/中文）" value={nu} onChange={(e) => setNu(e.target.value)} />
            <input className="input" type="password" placeholder="初始密码（≥6 位）" value={npw} onChange={(e) => setNpw(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="muted text-[11px]">角色</span>
              <button className={`chip !text-[11px] ${nrole === 'user' ? 'chip-active' : ''}`} onClick={() => setNrole('user')}>普通用户</button>
              <button className={`chip !text-[11px] ${nrole === 'admin' ? 'chip-active' : ''}`} onClick={() => setNrole('admin')}>管理员</button>
            </div>
            <button className="btn primary sm" onClick={createUser}>创建用户</button>
            {nuMsg && <span className="text-[11px] muted">{nuMsg}</span>}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <span className="text-xs font-semibold muted">用户列表（{users.length}）</span>
        {loadErr && <p className="text-[12px] mt-1" style={{ color: '#e5484d' }}>{loadErr}</p>}
        <div className="mt-2 grid gap-1.5">
          {users.map((u) => (
            <div key={u.username} className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
              <span>
                <b>{u.username}</b>
                <span className="muted ml-2 text-[11px]">{u.role === 'admin' ? '管理员' : '普通用户'}</span>
                <span className="muted ml-2 text-[11px]">创建于 {u.createdAt.slice(0, 10)}</span>
              </span>
              {u.username !== 'admin' && (
                <button className="btn sm" style={u.username === me?.username ? undefined : { color: '#e5484d', borderColor: '#e5484d' }}
                  onClick={() => delUser(u.username)}>
                  {u.username === me?.username ? '注销自己' : '删除'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

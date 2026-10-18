/** 前端会话管理：Token 存 localStorage，自动随请求带上 Authorization: Bearer。 */
export interface Session {
  token: string;
  username: string;
  role: 'admin' | 'user';
  exp: number; // 秒（Unix）
}

const KEY = 'wl_auth_v1';

/** 形状校验：localStorage 里的会话可能被旧版本/外部改动写坏。
 *  畸形数据一律当作未登录——否则 isAuthed() 会把「缺 exp 字段」判成永久有效，
 *  渲染层 sess.username.slice 直接 TypeError，整站白屏。 */
function isValidSession(s: unknown): s is Session {
  if (!s || typeof s !== 'object') return false;
  const v = s as Record<string, unknown>;
  return (
    typeof v.token === 'string' &&
    v.token.length > 0 &&
    typeof v.username === 'string' &&
    typeof v.role === 'string' &&
    typeof v.exp === 'number' &&
    Number.isFinite(v.exp) &&
    v.exp > 0
  );
}

let session: Session | null = (() => {
  try {
    const r = localStorage.getItem(KEY);
    if (!r) return null;
    const parsed: unknown = JSON.parse(r);
    if (!isValidSession(parsed)) throw new Error('bad session shape');
    return parsed;
  } catch {
    // 解析失败或形状不对：清掉坏数据，避免每次加载重复解析
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
})();

export function getSession(): Session | null {
  return session;
}
export function getToken(): string {
  return session?.token || '';
}
export function isAuthed(): boolean {
  return !!session && Number.isFinite(session.exp) && session.exp * 1000 > Date.now();
}
export function setSession(s: Session): void {
  session = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式可能不可写，忽略 */
  }
  notify();
}
export function logout(): void {
  session = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** 订阅登录态变化（登录 / 退出 / 改密后刷新）。返回取消订阅函数。 */
const listeners = new Set<() => void>();
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify(): void {
  listeners.forEach((cb) => cb());
}
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

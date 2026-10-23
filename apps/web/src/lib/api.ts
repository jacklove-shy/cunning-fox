import { useEffect, useState } from 'react';
import { authHeaders, getSession, logout } from './auth';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';

/** 求职自动化中台地址（默认本机，上线前用 VITE_CONSOLE_URL 注入域名/内网穿透地址） */
export const CONSOLE_URL =
  (import.meta.env.VITE_CONSOLE_URL as string | undefined) || 'http://127.0.0.1:8080';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    // headers 必须放在 ...init 之后再合并：
    // init.headers 可能是个空对象 {}，若放在后面展开会把 Content-Type 整体覆盖掉，
    // 后端 express.json() 拿不到 body → req.body 为空 → 报「必填」类 400。
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    // 带着 Token 却被判 401 → 会话已失效（改密、用户被删、Token 过期）。
    // 这里主动清掉本地会话，避免界面显示"已登录"但每次操作都失败。
    // 登录接口本身返回 401 是密码错误，不能触发登出。
    if (res.status === 401 && getSession() && path !== '/auth/login') {
      logout();
    }
    const msg = (data as { error?: string })?.error || `请求失败 (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: token ? { 'x-admin-token': token } : {} }),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), headers: token ? { 'x-admin-token': token } : {} }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: token ? { 'x-admin-token': token } : {} }),
  del: <T>(path: string, token?: string) =>
    request<T>(path, { method: 'DELETE', headers: token ? { 'x-admin-token': token } : {} }),
};

/** 轻量数据请求 hook：path 变化自动重取，组件卸载后丢弃过期响应 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    http
      .get<T>(path)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path]);

  return { data, loading, error, setData };
}

export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'all') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export function fmtNum(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n);
}

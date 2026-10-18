import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fmtDate, http, useApi, CONSOLE_URL } from '../lib/api';
import { getSession, isAuthed, logout, subscribe, type Session } from '../lib/auth';
import type { PostSummary, SiteMeta, Tool } from '../lib/types';
import { FoxMark, IconClose, IconMenu, IconMoon, IconSearch, IconSun } from './ui';
import { UserMenu } from './UserMenu';
import { AuthModal } from './AuthModal';
import { AiWidget } from './AiWidget';

const NAV = [
  { to: '/', label: '首页', exact: true },
  { to: '/posts', label: '博客' },
  { to: '/tools', label: '工具集市' },
  { to: '/archives', label: '归档' },
  { to: '/friends', label: '友链' },
  { to: '/nav', label: '导航' },
  { to: '/guestbook', label: '留言板' },
  { to: '/about', label: '关于' },
  { to: '/donate', label: '赞赏' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return (
    <button
      className="btn h-11 w-11 !px-0 md:h-9 md:w-9"
      title={theme === 'dark' ? '切到浅色' : '切到深色'}
      aria-label={theme === 'dark' ? '切到浅色主题' : '切到深色主题'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function SearchBox() {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [data, setData] = useState<{ posts: PostSummary[]; tools: Tool[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    if (!kw.trim()) {
      setData(null);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      http
        .get<{ posts: PostSummary[]; tools: Tool[] }>(`/search?q=${encodeURIComponent(kw.trim())}`)
        .then((d) => live && setData(d))
        .finally(() => live && setLoading(false));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kw]);

  const go = (to: string) => {
    setOpen(false);
    setKw('');
    navigate(to);
  };

  const empty = data && !data.posts.length && !data.tools.length;

  return (
    <>
      <button
        className="btn h-11 w-11 !px-0 md:h-9 md:w-9 2xl:w-auto 2xl:gap-2 2xl:!px-2.5"
        onClick={() => setOpen(true)}
        title="搜索 (⌘K)"
        aria-label="搜索"
      >
        <IconSearch />
        <span className="hidden text-xs muted 2xl:inline">搜索</span>
        <kbd className="chip hidden !px-1.5 !py-0 text-[11px] 2xl:inline">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-xl overflow-hidden fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4" style={{ borderColor: 'var(--line)' }}>
              <span className="muted shrink-0">
                <IconSearch />
              </span>
              <input
                ref={inputRef}
                className="w-full bg-transparent py-3.5 text-sm outline-none"
                placeholder="搜文章、工具…"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
              <button className="chip !px-2 text-[11px]" onClick={() => setOpen(false)}>
                ESC
              </button>
            </div>
            <div className="max-h-[54vh] overflow-y-auto p-2">
              {!kw.trim() && <p className="px-3 py-6 text-center text-sm muted">输入关键词，一次搜遍全站</p>}
              {loading && <p className="px-3 py-6 text-center text-sm muted">搜索中…</p>}
              {empty && <p className="px-3 py-6 text-center text-sm muted">没找到「{kw}」相关的内容</p>}
              {data?.posts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => go(`/posts/${p.slug}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--panel2)]"
                >
                  <span className="chip shrink-0">{p.cat}</span>
                  <span className="truncate text-sm">{p.title}</span>
                  <span className="ml-auto shrink-0 text-xs muted">{fmtDate(p.createdAt)}</span>
                </button>
              ))}
              {data?.tools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => go('/tools')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--panel2)]"
                >
                  <span className="shrink-0 text-base">{t.icon || '🧰'}</span>
                  <span className="truncate text-sm">{t.name}</span>
                  <span className="ml-auto shrink-0 text-xs muted">工具 · {t.cat}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Nav() {
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [sess, setSess] = useState<Session | null>(getSession());
  const { data: meta } = useApi<SiteMeta>('/meta');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 登录态变化时同步汉堡菜单里的账户区（UserMenu 在 <sm 隐藏，登录入口搬进这里）
  useEffect(() => subscribe(() => setSess(getSession())), []);

  useEffect(() => setMobile(false), [loc.pathname]);

  return (
    <header
      className="sticky top-0 z-40 transition-all"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--bg) 82%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : undefined,
        borderBottom: scrolled ? '1px solid var(--line)' : '1px solid transparent',
      }}
    >
      <div className="wrap flex h-16 items-center gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="回到首页">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl shadow-lg"
            style={{ background: '#fff4ec', border: '1px solid rgba(239,125,58,0.35)' }}
          >
            <FoxMark size={21} />
          </span>
          <span className="flex flex-col leading-none">
            {/* nowrap：窄屏下品牌名曾折成「一只狡猾的狐/梨」；tracking-wide 会撑宽姓名，去掉 */}
            <span className="whitespace-nowrap text-[15px] font-bold">{meta?.site?.name || '一只狡猾的狐狸'}</span>
            <span className="mt-1 hidden text-[11px] uppercase tracking-[0.16em] muted sm:block">personal bazaar</span>
          </span>
        </Link>

        {/* 768~1023 之间 9 个导航项会挤爆头部（实测溢出 15px 触发横向滚动），
            所以桌面导航从 lg(1024) 才开始显示，之下一律走汉堡菜单。
            1024~1535 之间曾实测链接被 flex 压缩成逐字换行（工具集市拆 4 行）——
            nav shrink-0 + 链接 nowrap 永不换行；空间不够时由工具栏分级让位：
            lg~xl 只显示头像（隐藏用户名）、<2xl 搜索只显示图标。 */}
        <nav className="ml-4 hidden shrink-0 items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.exact}
              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-[var(--panel2)]"
              style={({ isActive }) => ({
                color: isActive ? 'var(--txt)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
          <SearchBox />
          <ThemeToggle />
          <UserMenu />
          <button
            className="btn h-11 w-11 !px-0 md:h-9 md:w-9"
            aria-label={mobile ? '关闭菜单' : '打开菜单'}
            aria-expanded={mobile}
            onClick={() => setMobile((v) => !v)}
          >
            {mobile ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {mobile && (
        <div
          className="border-t lg:hidden"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--panel)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="wrap flex flex-col py-2">
            {/* 登录入口：<sm 时头部不放登录钮（宽度预算不够），收进汉堡菜单。
              用 isAuthed() 而非 sess 真值判断：过期会话在头部已显示「登录」，
              汉堡里不能再显示账户区，两处状态保持一致 */}
            {sess && isAuthed() ? (
              <div
                className="mb-1 flex items-center gap-2 border-b px-2 pb-2.5 pt-1"
                style={{ borderColor: 'var(--line)' }}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {sess.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{sess.username}</span>
                {sess.role === 'admin' && (
                  <Link to="/admin" className="btn h-9 px-2.5 text-xs">
                    管理
                  </Link>
                )}
                <button
                  className="btn h-9 px-2.5 text-xs"
                  onClick={() => {
                    logout();
                    setMobile(false);
                  }}
                >
                  退出
                </button>
              </div>
            ) : (
              <button
                className="flex min-h-[44px] items-center rounded-lg px-2 text-sm hover:bg-[var(--panel2)]"
                onClick={() => {
                  setMobile(false);
                  setAuthOpen(true);
                }}
              >
                登录 / 注册
              </button>
            )}
            {NAV.concat([{ to: '/admin', label: '内容管理', exact: false }]).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex min-h-[44px] items-center rounded-lg px-2 text-sm hover:bg-[var(--panel2)]"
              >
                {n.label}
              </Link>
            ))}
          </div>
          {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        </div>
      )}
    </header>
  );
}

/* 页脚三组链接：各 4 条，消掉旧版「内容 8 条 vs 模块 4 条」的右半留白。
   与 NAV 分开写是有意为之——页脚 IA（首页不重复、赞赏归「逛逛」）和顶栏不同。 */
const FOOTER_CONTENT = [
  { to: '/posts', label: '博客' },
  { to: '/tools', label: '工具集市' },
  { to: '/archives', label: '归档' },
  { to: '/about', label: '关于' },
];
const FOOTER_EXPLORE = [
  { to: '/friends', label: '友链' },
  { to: '/nav', label: '导航' },
  { to: '/guestbook', label: '留言板' },
  { to: '/donate', label: '赞赏' },
];

function Footer() {
  const { data: meta } = useApi<SiteMeta>('/meta');
  return (
    <footer className="mt-24 border-t" style={{ borderColor: 'var(--line)', background: 'var(--bg-soft)' }}>
      <div className="wrap grid gap-10 py-12 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <FoxMark size={20} /> {meta?.site?.name || '一只狡猾的狐狸'}
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed muted">
            {meta?.site?.desc || '一只狡猾的狐狸：技术笔记、能直接用的工具、以及做过的东西。'}
          </p>
        </div>
        <div className="text-sm">
          <p className="footer-head">内容</p>
          <ul className="space-y-2">
            {FOOTER_CONTENT.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="muted transition hover:text-[var(--txt)]">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm">
          <p className="footer-head">逛逛</p>
          <ul className="space-y-2">
            {FOOTER_EXPLORE.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="muted transition hover:text-[var(--txt)]">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm">
          <p className="footer-head">模块</p>
          <ul className="space-y-2">
            <li>
              <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="muted transition hover:text-[var(--txt)]">
                求职自动化中台 ↗
              </a>
            </li>
            <li>
              <Link to="/admin" className="muted transition hover:text-[var(--txt)]">
                内容管理
              </Link>
            </li>
            <li>
              <a href={meta?.site?.github || '#'} target="_blank" rel="noreferrer" className="muted transition hover:text-[var(--txt)]">
                GitHub ↗
              </a>
            </li>
            <li>
              <a href="/feed.xml" target="_blank" rel="noreferrer" className="muted transition hover:text-[var(--txt)]">
                RSS 订阅
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div
        className="wrap flex flex-col gap-2 border-t py-5 text-xs muted sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--line)', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <span>© {new Date().getFullYear()} {meta?.site?.author || '一只狡猾的狐狸'} · 用 React + Express 搭的一座小集市</span>
        <span>前后端分离 · TypeScript · 持续施工中</span>
      </div>
    </footer>
  );
}

export default function Layout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [loc.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <AiWidget />
    </div>
  );
}

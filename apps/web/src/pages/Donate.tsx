import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { http, useApi } from '../lib/api';
import { getSession, isAuthed } from '../lib/auth';

interface Method {
  id: string;
  name: string;
  icon?: string;
  qr: string;
  note?: string;
}

interface DonateCfg {
  enabled?: boolean;
  kicker?: string;
  title: string;
  intro?: string;
  amounts?: number[];
  customAmount?: boolean;
  methods?: Method[];
  note?: string;
  providerType?: string;
}

interface Donation {
  id: string;
  nick: string;
  amount: number;
  message?: string;
  method?: string;
  status: 'pending' | 'confirmed';
  createdAt: string;
  confirmedAt?: string;
}

interface DonateRes {
  config: DonateCfg;
  wall: Donation[];
  stats: { count: number; total: number };
}

const money = (n: number) => `¥${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')}`;
/** 大额展示去尾零：¥23.5 而非 ¥23.50（对齐参考站扫码区「应付金额」） */
const moneyTrim = (n: number) =>
  `¥${(Math.round(n * 100) / 100).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;

/** 相对时间：今天 / 昨天 / X 天前（30 天内），更早显示 月日（对齐参考站横流）。
 *  按日历日差算（都归到当天 0 点），避免「1.5 天前」被 floor 成昨天的歧义 */
const relDate = (iso: string) => {
  const d = new Date(iso);
  const startOfDay = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 数字滚动：0 → 目标值（1.1s easeOutCubic）。首次入场才播，之后数据刷新直接落新值。
 *  尊重系统「减弱动态效果」偏好（直接落终值）。 */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [n, setN] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (value <= 0) {
      setN(0);
      return; // 还没有数据：保留「首次」标记，等真有值再播
    }
    if (!first.current) {
      setN(value);
      return; // 轮询刷新：不重播动画，避免数字反复归零
    }
    first.current = false;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(n)}</>;
}

/* ===== 内联图标（本站无 iconify， stroke 线框随主题着色）===== */
const Icon = ({ d, size = 14, fill = 'none', stroke = 2 }: { d: string; size?: number; fill?: string; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const HeartIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 21s-7.5-4.7-9.3-9A5.4 5.4 0 0 1 12 6.6a5.4 5.4 0 0 1 9.3 5.4C19.5 16.3 12 21 12 21z" />
  </svg>
);
const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const CoinsIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
  </svg>
);
const ScanIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8" />
  </svg>
);
const YenIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 4 7 8 7-8M12 12v8M8 16h8M8 20h8" />
  </svg>
);
const QrIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M17 21v3M21 17v.01M21 21v.01" />
  </svg>
);
const ClockIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const SparklesIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </svg>
);
const GiftIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7M12 8S10.5 3 7.5 4.5C5.5 5.5 6 8 12 8zM12 8s1.5-5 4.5-3.5C18.5 5.5 18 8 12 8z" />
  </svg>
);

/** 步骤完成态对勾 */
function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

const STEPS = ['选金额', '扫码', '完成'];

/** 弹幕五轨 top 位置（对齐参考站 3/23/43/63/83%） */
const TRACKS = [3, 23, 43, 63, 83];
/** 按 id 生成稳定的伪随机数：同一笔赞赏每次渲染 duration 一致，不跳变 */
const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** 赞赏：收款码路线（选金额 → 扫码 → 留名认领 → 管理员确认上墙）。
 *  结构 1:1 对标小白龙博客 /donate：一张大卡（hero + 三步条 + 金额面板 + 扫码栏）+ 弹幕赞赏墙 + 最近赞赏横流。
 *  本站增强（参考站没有）：统计数字滚动、30s 轮询、💎 大腿徽标、认领-确认流程。 */
export default function Donate() {
  const { data, loading, setData } = useApi<DonateRes>('/donate');
  const session = getSession();
  const isAdmin = isAuthed() && session?.role === 'admin';
  const { data: pending, setData: setPending } = useApi<{ items: Donation[]; total: number }>(
    isAdmin ? '/donate/pending' : null
  );

  // 轮询：别人确认上墙后，本页统计/横流/墙自动更新（切到别的标签页时暂停，省资源）
  useEffect(() => {
    let timer = 0;
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const d = await http.get<DonateRes>('/donate');
          setData(d);
        } catch {
          /* 静默失败：轮询不打扰用户 */
        }
      }
      timer = window.setTimeout(poll, 30000);
    };
    timer = window.setTimeout(poll, 30000);
    return () => window.clearTimeout(timer);
  }, [setData]);

  const cfg = data?.config;
  const methods = useMemo(() => cfg?.methods || [], [cfg]);
  const amounts = cfg?.amounts || [];
  const wall = data?.wall || [];
  const stats = data?.stats || { count: 0, total: 0 };

  // 选中档：用户没主动选过时跟随配置默认档（amounts[1]，对齐参考站默认 ¥0.88）。
  // 不能用 useState(amounts[1])——首帧 data 未到达 amounts 为空，会错初始化成兜底值且再不更新
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [methodId, setMethodId] = useState(methods[0]?.id || 'wechat');
  const [nick, setNick] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');
  const [claimed, setClaimed] = useState(false);
  /** 已下单：点了金额档或「确认」后进入 live 态（扫码栏出二维码/订单号），
   *  「重新选择金额」复位。默认高亮 ≠ 已下单（与参考站一致） */
  const [ordered, setOrdered] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [imgErr, setImgErr] = useState<Record<string, boolean>>({});

  const customValid = custom.trim() !== '' && Number(custom) > 0;
  const finalAmount = custom.trim() ? Number(custom) : (picked ?? amounts[1] ?? amounts[0] ?? 0.88);
  const method = methods.find((m) => m.id === methodId) || methods[0];
  /** 步骤：选金额 → 扫码 → 完成（认领提交后三步全亮完成态） */
  const step = claimed ? STEPS.length + 1 : ordered ? 2 : 1;

  const genOrder = () => {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `D${Date.now().toString(36).toUpperCase()}${rand}`;
  };

  const claim = async () => {
    if (!finalAmount || finalAmount <= 0) {
      setTip('金额要大于 0');
      return;
    }
    setBusy(true);
    setTip('');
    try {
      await http.post('/donate/claim', {
        nick: nick.trim() || undefined,
        amount: finalAmount,
        message: message.trim() || undefined,
        method: methodId,
      });
      setClaimed(true);
      setTip('');
      setNick('');
      setMessage('');
    } catch (e) {
      setTip('提交失败：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmOne = async (d: Donation) => {
    await http.post(`/donate/${d.id}/confirm`, {});
    setPending((prev) =>
      prev ? { items: prev.items.filter((x) => x.id !== d.id), total: prev.total - 1 } : prev
    );
    setData((prev) =>
      prev
        ? {
            ...prev,
            wall: [{ ...d, status: 'confirmed', confirmedAt: new Date().toISOString() }, ...prev.wall],
            stats: { count: prev.stats.count + 1, total: prev.stats.total + d.amount },
          }
        : prev
    );
  };

  const removeOne = async (d: Donation) => {
    await http.del(`/donate/${d.id}`);
    setPending((prev) =>
      prev ? { items: prev.items.filter((x) => x.id !== d.id), total: prev.total - 1 } : prev
    );
  };

  if (loading) return <div className="wrap pt-16 text-sm muted">加载中…</div>;
  if (!cfg) return <div className="wrap pt-16 text-sm muted">赞赏页暂未配置</div>;
  if (cfg.enabled === false) {
    return (
      <div className="wrap max-w-3xl pt-10">
        <header className="border-b pb-7" style={{ borderColor: 'var(--line)' }}>
          <p className="kicker">{cfg.kicker || 'support'}</p>
          <h1 className="mt-2.5 h1">{cfg.title}</h1>
        </header>
        <p className="mt-8 text-sm muted">赞赏通道暂时关闭，路过就留下个脚印吧。</p>
        <Link to="/guestbook" className="btn mt-4 h-9 text-xs">去留言板 →</Link>
      </div>
    );
  }

  return (
    <div className="wrap max-w-4xl pt-6 md:pt-10">
      {/* ===== 一张大卡：hero + 三步条 + 金额面板 + 扫码栏 + 自定义/留言 ===== */}
      <section className="card donate-checkout dz-rise">
        {/* --- hero：点阵 + 双光晕 + 渐变图标 + 标题 + 支付方式 tag + 支持者统计卡 --- */}
        <header className="donate-page-hero">
          <div className="donate-page-hero__mesh" aria-hidden="true" />
          <div className="donate-page-hero__glow donate-page-hero__glow--right" aria-hidden="true" />
          <div className="donate-page-hero__glow donate-page-hero__glow--left" aria-hidden="true" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-start gap-3.5 md:gap-4">
              <div className="donate-page-hero__icon" aria-hidden="true">
                <HeartIcon size={20} />
              </div>
              <div className="donate-page-hero__copy min-w-0">
                <p className="donate-page-hero__eyebrow">在线赞赏</p>
                <h1 className="donate-page-hero__title">{cfg.title}</h1>
                {cfg.intro && <p className="donate-page-hero__desc">{cfg.intro}</p>}
                <div className="donate-page-hero__tags">
                  {methods.map((m) => (
                    <span key={m.id} className={`donate-checkout__tag donate-checkout__tag--${m.id}`}>
                      <span aria-hidden="true">{m.icon || '💠'}</span>
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="donate-page-hero__stat">
              <div className="donate-page-hero__stat-icon" aria-hidden="true">
                <UsersIcon />
              </div>
              <dl className="min-w-0">
                <dt className="donate-page-hero__stat-label">支持者</dt>
                <dd className="donate-page-hero__stat-value">
                  <CountUp value={stats.count} format={(n) => String(Math.round(n))} /> 位
                </dd>
              </dl>
            </div>
          </div>
        </header>

        {/* --- 三步条：选中金额后第一步变完成、第二步激活 --- */}
        <div className="donate-checkout__steps-wrap">
          <ol className="donate-steps" aria-label="赞赏步骤">
            {STEPS.map((label, i) => {
              const idx = i + 1;
              const state = idx < step ? 'done' : idx === step ? 'active' : 'todo';
              return (
                <li key={label} className={`donate-step${state === 'active' ? ' donate-step--active' : ''}${state === 'done' ? ' donate-step--done' : ''}`}>
                  <span className="donate-step__marker" aria-hidden="true">
                    {state === 'done' ? <CheckIcon /> : i === 0 ? <CoinsIcon /> : i === 1 ? <ScanIcon /> : <CheckIcon />}
                  </span>
                  <span className="donate-step__label">{label}</span>
                  {i < STEPS.length - 1 && <span className="donate-step__connector" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
          <p className="donate-steps-mobile-hint">扫码</p>
        </div>

        <div className="donate-checkout__panel">
          {/* --- 左：快捷金额网格 --- */}
          <div className="donate-checkout__amount-section">
            <div>
              <p className="donate-section-label">
                <Icon d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" size={12} />
                快捷金额
              </p>
              <div className="donate-amount-grid">
                {amounts.map((a, i) => {
                  const isPicked = !custom.trim() && (picked ?? amounts[1] ?? amounts[0]) === a;
                  const isWide = i === amounts.length - 1 && amounts.length > 8;
                  return (
                    <button
                      key={`${a}-${isPicked}`}
                      type="button"
                      className={`donate-amount-btn${isPicked ? ' donate-amount-btn--active' : ''}${isWide ? ' donate-amount-btn--wide' : ''}`}
                      onClick={() => {
                        setPicked(a);
                        setCustom('');
                        setOrdered(true);
                        setOrderNo(genOrder());
                        setClaimed(false);
                      }}
                    >
                      <span className="donate-amount-btn__label tabular-nums">
                        <span className="donate-amount-btn__symbol">¥</span>
                        {money(a).slice(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* --- 左下：自定义金额 + 留言 --- */}
          <div className="donate-checkout__extras">
            <div className="donate-fields">
              <div>
                <label className="donate-field-label" htmlFor="donate-custom">自定义金额（元）</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 muted" aria-hidden="true">
                      <YenIcon size={18} />
                    </span>
                    <input
                      id="donate-custom"
                      className="input !py-1.5 pl-9 text-sm"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      autoComplete="off"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                  <button
                    type="button"
                    className="donate-confirm-btn"
                    disabled={!customValid}
                    onClick={() => {
                      setPicked(null);
                      setOrdered(true);
                      setOrderNo(genOrder());
                      setClaimed(false);
                    }}
                  >
                    确认
                  </button>
                </div>
              </div>
              <div>
                <label className="donate-field-label" htmlFor="donate-message">留言（可选）</label>
                <textarea
                  id="donate-message"
                  className="input !py-1.5 text-sm"
                  rows={3}
                  maxLength={200}
                  placeholder="写下鼓励的话…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </div>

            {/* 认领提交：本站特有流程（扫码后留名 → 管理员确认上墙） */}
            {claimed ? (
              <div className="donate-success-banner">
                <div className="donate-success-banner__glow" aria-hidden="true" />
                <span className="donate-success-banner__confetti donate-success-banner__confetti--1" aria-hidden="true">✨</span>
                <span className="donate-success-banner__confetti donate-success-banner__confetti--2" aria-hidden="true">💫</span>
                <span className="donate-success-banner__confetti donate-success-banner__confetti--3" aria-hidden="true">⭐</span>
                <div className="donate-success-banner__icon-wrap" aria-hidden="true">
                  <CheckIcon size={22} />
                </div>
                <div className="donate-success-banner__copy">
                  <p className="donate-success-banner__title">心意已收到！</p>
                  <p className="donate-success-banner__text">
                    已记录 {moneyTrim(finalAmount)}，等我确认后就会出现在赞赏墙上～
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input !py-1.5 text-sm"
                  style={{ maxWidth: 200, flex: '1 1 140px' }}
                  placeholder="昵称（可空）"
                  value={nick}
                  maxLength={24}
                  onChange={(e) => setNick(e.target.value)}
                />
                <button className="btn btn-primary h-9 text-xs" onClick={claim} disabled={busy || !ordered || finalAmount <= 0}>
                  {busy ? '提交中…' : '我已完成赞赏'}
                </button>
                {tip && <span className="text-[12px] muted">{tip}</span>}
              </div>
            )}
            {claimed && (
              <button
                className="self-start text-[12px] muted underline-offset-2 hover:underline"
                onClick={() => setClaimed(false)}
              >
                再赞一笔
              </button>
            )}
            {cfg.note && <p className="text-[12px] leading-relaxed muted">{cfg.note}</p>}
          </div>

          {/* --- 右：扫码支付栏（空态 / live 态） --- */}
          <aside className="donate-pay-station">
            <div className="donate-pay-station__glow" aria-hidden="true" />
            <div className="donate-pay-station__header">
              <ScanIcon />
              扫码支付
            </div>
            <div className={`donate-pay-station__body${ordered ? '' : ' donate-pay-station__body--empty'}`}>
              {ordered ? (
                <>
                  <div className="donate-pay-station__live">
                    <span className="donate-pay-station__live-dot" aria-hidden="true" />
                    等待支付
                  </div>
                  <div className="donate-qr-scanner">
                    <span className="donate-qr-scanner__corner donate-qr-scanner__corner--tl" aria-hidden="true" />
                    <span className="donate-qr-scanner__corner donate-qr-scanner__corner--tr" aria-hidden="true" />
                    <span className="donate-qr-scanner__corner donate-qr-scanner__corner--bl" aria-hidden="true" />
                    <span className="donate-qr-scanner__corner donate-qr-scanner__corner--br" aria-hidden="true" />
                    {method && !imgErr[method.id] ? (
                      <img
                        className="donate-qr-frame"
                        src={method.qr}
                        alt={`${method.name}收款码`}
                        onError={() => setImgErr((p) => ({ ...p, [method.id]: true }))}
                      />
                    ) : (
                      <div className="donate-qr-frame grid place-items-center text-center" style={{ width: 168, height: 168 }}>
                        <div>
                          <p className="text-xl">🖼️</p>
                          <p className="mt-1 px-2 text-[11px] leading-tight muted">
                            还没上传{method?.name || '支付'}收款码
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="donate-pay-station__amount">
                    <span className="donate-pay-station__amount-label">应付金额</span>
                    <span className="donate-pay-station__amount-value">{moneyTrim(finalAmount || 0)}</span>
                  </div>
                  <p className="donate-pay-station__hint">
                    {method?.note || '扫码支付'}，二维码 15 分钟内有效；到账后可在下方留名，我确认后就会出现在赞赏墙上
                  </p>
                  <p className="donate-pay-station__order">订单号 {orderNo}</p>
                  <div className="donate-pay-methods">
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`donate-pay-badge donate-pay-badge--${m.id}`}
                        title={m.name}
                        aria-label={m.name}
                        aria-pressed={methodId === m.id}
                        onClick={() => setMethodId(m.id)}
                        style={methodId === m.id ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
                      >
                        <span aria-hidden="true" className="text-sm">{m.icon || '💠'}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="donate-pay-station__rechoose"
                    onClick={() => {
                      setOrdered(false);
                      setClaimed(false);
                    }}
                  >
                    重新选择金额
                  </button>
                </>
              ) : (
                <>
                  <div className="donate-qr-placeholder" aria-hidden="true">
                    <QrIcon size={24} />
                  </div>
                  <p className="donate-pay-station__hint">选择金额后将在此显示支付二维码</p>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* ===== 赞赏墙：弹幕横飞 ===== */}
      <section className="donation-danmaku donation-danmaku--footer">
        <div className="donation-danmaku-bg" aria-hidden="true" />
        <div className="donation-danmaku-glow donation-danmaku-glow--left" aria-hidden="true" />
        <div className="donation-danmaku-glow donation-danmaku-glow--right" aria-hidden="true" />
        <div className="donation-danmaku-sparkles" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`donation-danmaku-sparkle donation-danmaku-sparkle--${i + 1}`} />
          ))}
        </div>

        <div className="donation-danmaku-head">
          <div className="donation-danmaku-head__icon" aria-hidden="true">
            <HeartIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="donation-danmaku-head__title">赞赏墙</h2>
              <span className="donation-danmaku-head__badge tabular-nums">{stats.count} 位</span>
              <span className="text-[12px] muted tabular-nums">共 {money(stats.total)}</span>
            </div>
            <p className="donation-danmaku-head__hint">感谢每一位读者的鼓励</p>
          </div>
          <div className="donation-danmaku-head__ornament" aria-hidden="true">
            <SparklesIcon size={12} />
            <GiftIcon size={12} />
            <SparklesIcon size={12} />
          </div>
        </div>

        <div className="donation-danmaku-body">
          {wall.length ? (
            <div className="donation-danmaku-stage">
              <span className="donation-danmaku-stage__corner donation-danmaku-stage__corner--tl" aria-hidden="true" />
              <span className="donation-danmaku-stage__corner donation-danmaku-stage__corner--tr" aria-hidden="true" />
              <span className="donation-danmaku-stage__corner donation-danmaku-stage__corner--bl" aria-hidden="true" />
              <span className="donation-danmaku-stage__corner donation-danmaku-stage__corner--br" aria-hidden="true" />
              <div className="donation-danmaku-stage__inner">
                {wall.map((d, i) => {
                  const h = hashOf(d.id);
                  const dur = 13.8 + (h % 37) / 10; // 13.8s ~ 17.4s
                  // 负 delay 让弹幕一进场就均匀分布在一个周期内，不窝在起点
                  const delay = -((h % 100) / 100) * dur;
                  const track = TRACKS[i % TRACKS.length];
                  const variant = i % 5;
                  return (
                    <div
                      key={d.id}
                      className={`donation-danmaku-item donation-danmaku-item--v${variant}`}
                      style={{ top: `${track}%`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
                    >
                      <span className="donation-danmaku-item__icon-wrap" aria-hidden="true">
                        {d.amount >= 50 ? <SparklesIcon size={12} /> : <HeartIcon size={10} />}
                      </span>
                      <span>
                        <b className="font-semibold" style={{ color: 'var(--dw-coral)' }}>{d.nick}</b>
                        {' '}赞赏了 <b className="font-semibold tabular-nums">{money(d.amount)}</b>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="donation-danmaku-stage grid place-items-center">
              <div className="text-center">
                <div className="donation-qr-placeholder mx-auto" aria-hidden="true">
                  <HeartIcon size={22} />
                </div>
                <p className="mt-3 text-[13px] muted">还没有人赞赏，你可以是第一个。</p>
              </div>
            </div>
          )}
        </div>

        {/* --- 最近赞赏：横向滑动卡片流 --- */}
        {wall.length > 0 && (
          <div className="donation-records">
            <div className="donation-records__head">
              <p className="donation-records__label">
                <ClockIcon size={12} />
                最近赞赏
              </p>
            </div>
            <ul className="donation-records-list">
              {/* 全量渲染（对齐参考站：29 位支持者的横流全部铺出，靠横向滚动浏览） */}
              {wall.map((d, i) => (
                <li key={d.id} className={`donation-record-chip${i === 0 ? ' donation-record-chip--latest' : ''}`}>
                  <div className="donation-record-chip__row">
                    <span className="donation-record-chip__amount">{money(d.amount)}</span>
                    {i === 0 && <span className="donation-record-chip__tag">最新</span>}
                  </div>
                  {d.message && <span className="donation-record-chip__msg">{d.message}</span>}
                  <span className="donation-record-chip__time">{relDate(d.confirmedAt || d.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 源码授权：与赞赏同页（对齐小白龙，扫码咨询） */}
      <LicenseBlock />

      {/* 管理员：待确认 */}
      {isAdmin && (
        <section className="mt-10 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            待确认
            <span className="chip !py-0 text-[11px] tabular-nums">{pending?.total ?? 0}</span>
          </h2>
          <p className="mt-1 text-[12px] muted">
            读者自己提交的「我已完成赞赏」会出现在这里，核对到账后点「确认上墙」。
          </p>
          {pending?.items.length ? (
            <ul className="mt-3 space-y-2">
              {pending.items.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <b>{d.nick}</b>
                  <span style={{ color: 'var(--accent)' }}>{money(d.amount)}</span>
                  <span className="text-[11px] muted">{d.method === 'alipay' ? '支付宝' : '微信'}</span>
                  {d.message && <span className="w-full text-[12px] muted">{d.message}</span>}
                  <span className="ml-auto flex gap-2">
                    <button className="btn btn-primary h-8 !px-2.5 text-[11px]" onClick={() => confirmOne(d)}>
                      确认上墙
                    </button>
                    <button className="btn h-8 !px-2.5 text-[11px]" onClick={() => removeOne(d)}>
                      删除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] muted">暂无待确认记录。</p>
          )}
        </section>
      )}
    </div>
  );
}

interface LicenseCfg {
  kicker?: string;
  title: string;
  tagline?: string;
  price?: number;
  priceNote?: string;
  deliverables?: string[];
  contact?: { wechat?: string; wechatQr?: string; email?: string; note?: string };
}

/** 源码授权区块：与赞赏同页，微信扫码咨询（对齐小白龙） */
function LicenseBlock() {
  const { data } = useApi<LicenseCfg | null>('/license');
  const [qrErr, setQrErr] = useState(false);

  if (!data) return null;
  const price = data.price ? new Intl.NumberFormat('zh-CN').format(data.price) : null;
  const qr = data.contact?.wechatQr;

  return (
    <section id="license" className="mt-12 border-t pt-8" style={{ borderColor: 'var(--line)' }}>
      <p className="kicker">{data.kicker || 'source license'}</p>
      <h2 className="mt-2 text-xl font-bold tracking-tight">{data.title}</h2>
      {data.tagline && <p className="mt-1.5 text-[13px] muted">{data.tagline}</p>}

      <div className="card mt-4 flex flex-wrap items-center gap-5 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] muted">授权定价</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{price ? `¥${price}` : '面议'}</p>
          {data.priceNote && (
            <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed muted">{data.priceNote}</p>
          )}
        </div>

        <div className="ml-auto flex flex-col items-center">
          {qr && !qrErr ? (
            <img
              src={qr}
              alt="微信咨询二维码"
              className="h-44 w-44 rounded-lg object-contain"
              style={{ background: '#fff', border: '1px solid var(--line)' }}
              onError={() => setQrErr(true)}
            />
          ) : (
            <div
              className="grid h-44 w-44 place-items-center rounded-lg border border-dashed text-center"
              style={{ borderColor: 'var(--line)' }}
            >
              <div>
                <p className="text-xl">💬</p>
                <p className="mt-1 px-1 text-[11px] leading-tight muted">
                  微信二维码
                  <br />
                  待上传
                </p>
              </div>
            </div>
          )}
          <p className="mt-1.5 text-[11px] muted">微信扫码咨询</p>
        </div>
      </div>

      {data.deliverables?.length ? (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {data.deliverables.slice(0, 6).map((d) => (
            <li key={d} className="flex gap-1.5 text-[12px] leading-relaxed">
              <span style={{ color: 'var(--ok, #3ecf8e)' }}>✓</span>
              <span className="min-w-0">{d}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to="/license" className="btn h-9 text-xs">完整交付清单与条款 →</Link>
        {data.contact?.wechat && <span className="text-[12px] muted">微信：{data.contact.wechat}</span>}
        {data.contact?.email && <span className="text-[12px] muted">邮箱：{data.contact.email}</span>}
      </div>
    </section>
  );
}

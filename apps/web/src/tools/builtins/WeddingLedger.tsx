import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { http } from '../../lib/api';
import { getSession, isAuthed, logout, setSession as persistSession, type Session } from '../../lib/auth';
import { LedgerBook } from './wedding/LedgerBook';
import { ThanksCards, printAfterFonts } from './wedding/ThanksCards';
import { Login } from './wedding/Login';
import { AdminPanel } from './wedding/AdminPanel';
import {
  BOOK_TEMPLATES, EMPTY_FILTER, FORMS, HAND_FONTS, RELATIONS, SIDES,
  computeStats, displayName, filterEntries, formLabel, money, sideLabel, toChineseAmount, toCsv,
  type GiftEntry, type GiftForm, type GiftSide, type LedgerFilter, type WeddingMeta,
} from './wedding/types';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_META: WeddingMeta = { groom: '', bride: '', date: '', venue: '', banquet: '', recorder: '', thanks: '感谢您拨冗莅临，共襄盛事。薄礼不成敬意，愿幸福与喜乐常伴您左右。' };

const BASE_TABS = [
  { id: 'book', name: '记账', desc: '现场快速记一笔' },
  { id: 'ledger', name: '礼账', desc: '筛选查询 · 统计导出' },
  { id: 'album', name: '成册', desc: '手写字体 · 卡纸 · 打印' },
  { id: 'cards', name: '谢卡', desc: '批量答谢卡' },
] as const;
type TabId = (typeof BASE_TABS)[number]['id'] | 'account';

const SAMPLE: Omit<GiftEntry, 'id' | 'createdAt'>[] = [
  { title: '大姑父', name: '张建国', amount: 2000, relation: '亲戚', side: 'groom', form: 'cash', gift: '', partySize: 2, recorder: '爸爸', date: todayStr(), note: '带姑姑一起来' },
  { title: '小姨', name: '李美琳', amount: 1200, relation: '亲戚', side: 'bride', form: 'wechat', gift: '', partySize: 1, recorder: '妈妈', date: todayStr(), note: '提前一天转的' },
  { title: '', name: '王志远', amount: 800, relation: '同学', side: 'groom', form: 'alipay', gift: '', partySize: 1, recorder: '新郎', date: todayStr(), note: '大学室友，从外地赶来' },
  { title: '', name: '陈晨', amount: 600, relation: '同事', side: 'bride', form: 'cash', gift: '', partySize: 1, recorder: '新娘', date: todayStr(), note: '' },
  { title: '二叔', name: '赵文武', amount: 5000, relation: '家人', side: 'groom', form: 'cash', gift: '', partySize: 3, recorder: '爸爸', date: todayStr(), note: '二叔一家' },
  { title: '', name: '孙悦', amount: 666, relation: '朋友', side: 'both', form: 'redpacket', gift: '', partySize: 1, recorder: '新郎', date: todayStr(), note: '闺蜜团代表' },
  { title: '周经理', name: '周正豪', amount: 1000, relation: '领导', side: 'bride', form: 'wechat', gift: '', partySize: 1, recorder: '新娘', date: todayStr(), note: '部门经理' },
  { title: '吴婶', name: '吴桂芳', amount: 300, relation: '邻居', side: 'both', form: 'gift', gift: '蚕丝被一对', partySize: 2, recorder: '妈妈', date: todayStr(), note: '送了一对蚕丝被' },
];

/** 婚礼礼账本：记账 → 理账 → 手写体成册打印 → 答谢卡 */
export function WeddingLedger() {
  const [tab, setTab] = useState<TabId>('book');
  const [meta, setMeta] = useState<WeddingMeta>(DEFAULT_META);
  const [entries, setEntries] = useState<GiftEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  /* 会话：未登录显示登录页；登录后按角色展示（管理员多一个「账户」页） */
  const [session, setSessionState] = useState<Session | null>(() => (isAuthed() ? getSession() : null));
  const login = (s: Session) => { persistSession(s); setSessionState(s); };
  const doLogout = () => { logout(); setSessionState(null); setEntries([]); setTab('book'); };
  const TABS = useMemo(
    () => (session?.role === 'admin' ? [...BASE_TABS, { id: 'account', name: '账户', desc: '权限 · 用户管理' } as const] : BASE_TABS),
    [session?.role],
  );

  const load = useCallback(async () => {
    try {
      const d = await http.get<{ meta: WeddingMeta; entries: GiftEntry[] }>('/wedding');
      setMeta({ ...DEFAULT_META, ...d.meta });
      setEntries(d.entries || []);
      setLoadErr('');
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (session) load();
    else setLoading(false);
  }, [load, session]);

  /* 手写字体：Google Fonts 主源 + loli.net 国内镜像兜底（后注入的 @font-face 层叠覆盖） */
  useEffect(() => {
    const fams = ['ZCOOL KuaiLe', 'Zhi Mang Xing', 'Ma Shan Zheng', 'Long Cang', 'Liu Jian Mao Cao'];
    const q = fams.map((f) => `family=${f.replace(/ /g, '+')}`).join('&');
    for (const host of ['https://fonts.googleapis.com/css2', 'https://fonts.loli.net/css2']) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `${host}?${q}&display=swap`;
      document.head.appendChild(l);
    }
  }, []);

  /* ---------- 记账表单 ---------- */
  const nameRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', title: '', amount: '', relation: '朋友', side: 'both' as GiftSide, form: 'cash' as GiftForm,
    gift: '', partySize: '1', recorder: '', date: todayStr(), note: '',
  });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submitEntry = async () => {
    const name = form.name.trim();
    if (!name) return setFormErr('请填来宾姓名');
    const amount = Number(form.amount);
    if (form.amount === '' || !Number.isFinite(amount) || amount < 0) return setFormErr('请填正确金额（礼物可填 0，备注里写清礼物）');
    setSaving(true);
    setFormErr('');
    try {
      const entry = await http.post<GiftEntry>('/wedding/entries', {
        ...form, name, amount, partySize: Math.max(1, Number(form.partySize) || 1),
        recorder: form.recorder.trim() || meta.recorder,
      });
      setEntries((prev) => [...prev, entry]);
      // 连续录入：清空本笔内容，焦点回到姓名
      setForm((f) => ({ ...f, name: '', title: '', amount: '', gift: '', note: '' }));
      nameRef.current?.focus();
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const seedSample = async () => {
    for (const s of SAMPLE) {
      try { const e = await http.post<GiftEntry>('/wedding/entries', s); setEntries((prev) => [...prev, e]); } catch { /* skip */ }
    }
  };

  /* ---------- 礼账：筛选 / 排序 / 选择 ---------- */
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState({ key: 'date', dir: 'asc' as 'asc' | 'desc' });
  const [selected, setSelected] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);

  const filtered = useMemo(() => {
    const rows = filterEntries(entries, filter);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      let r = 0;
      if (sort.key === 'amount') r = a.amount - b.amount;
      else if (sort.key === 'name') r = a.name.localeCompare(b.name, 'zh-Hans-CN');
      else r = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      return r * dir || a.createdAt.localeCompare(b.createdAt);
    });
  }, [entries, filter, sort]);
  const stats = useMemo(() => computeStats(filtered), [filtered]);

  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectedEntries = entries.filter((e) => selected.includes(e.id));

  /* ---------- 行内编辑 / 删除 ---------- */
  const [editId, setEditId] = useState('');
  const [editDraft, setEditDraft] = useState({ amount: '', note: '', recorder: '' });
  const [delArmed, setDelArmed] = useState('');

  const startEdit = (e: GiftEntry) => { setEditId(e.id); setEditDraft({ amount: String(e.amount), note: e.note, recorder: e.recorder }); };
  const saveEdit = async (id: string) => {
    try {
      const u = await http.patch<GiftEntry>(`/wedding/entries/${id}`, {
        amount: Number(editDraft.amount), note: editDraft.note, recorder: editDraft.recorder,
      });
      setEntries((prev) => prev.map((x) => (x.id === id ? u : x)));
      setEditId('');
    } catch (e) { alert((e as Error).message); }
  };
  const delEntry = async (id: string) => {
    try {
      await http.del(`/wedding/entries/${id}`);
      setEntries((prev) => prev.filter((x) => x.id !== id));
      setSelected((s) => s.filter((x) => x !== id));
      setDelArmed('');
    } catch (e) { alert((e as Error).message); }
  };
  const clearAll = async () => {
    try {
      await http.del('/wedding/entries?confirm=clear');
      setEntries([]); setSelected([]); setClearing(false);
    } catch (e) { alert((e as Error).message); }
  };

  /* ---------- 成册 / 谢卡设置 ---------- */
  const [fontId, setFontId] = useState('zhimang');
  const [templateId, setTemplateId] = useState('redgold');
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [jitter, setJitter] = useState(true);
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [metaDraft, setMetaDraft] = useState<WeddingMeta>(meta);
  const [metaSaving, setMetaSaving] = useState(false);
  const [thanksDraft, setThanksDraft] = useState(meta.thanks);
  const [thanksSaving, setThanksSaving] = useState(false);

  useEffect(() => { setMetaDraft(meta); setThanksDraft(meta.thanks); }, [meta]);

  const saveMeta = async (patch: Partial<WeddingMeta>) => {
    setMetaSaving(true);
    try {
      const m = await http.patch<WeddingMeta>('/wedding/meta', patch) as unknown as WeddingMeta;
      setMeta({ ...DEFAULT_META, ...m });
    } catch (e) { alert((e as Error).message); } finally { setMetaSaving(false); }
  };
  const saveThanks = async () => {
    setThanksSaving(true);
    try { await saveMeta({ thanks: thanksDraft }); } catch { /* alert 已在 saveMeta */ } finally { setThanksSaving(false); }
  };

  const albumEntries = scope === 'filtered' ? filtered : entries;
  const cardEntries = selectedEntries.length ? selectedEntries : filtered.length ? filtered : entries;

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `婚礼礼账_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!session) return <Login onOk={login} />;

  if (loading) return <div className="card p-6 muted text-sm">正在加载礼账数据…</div>;
  if (loadErr) return (
    <div className="card p-6">
      <p className="text-sm" style={{ color: '#e5484d' }}>加载失败：{loadErr}</p>
      <button className="btn sm mt-2" onClick={load}>重试</button>
    </div>
  );

  const inputStyle = { width: '100%' };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="muted text-[11px]">已登录：<b>{session.username}</b>（{session.role === 'admin' ? '管理员' : '普通用户'}）</span>
        <button className="btn sm" onClick={doLogout}>退出登录</button>
      </div>
      {/* 页签 */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.id} className={`chip ${tab === t.id ? 'chip-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
        <span className="muted ml-1 text-[11px]">共 {entries.length} 笔 · 总额 {money(computeStats(entries).total)}</span>
      </div>

      {/* ========== 记账 ========== */}
      {tab === 'book' && (
        <>
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold muted">快速记一笔（回车提交，可连续记）</span>
              <span className="muted text-[11px]">默认记账人：{meta.recorder || '未设置'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1">
                <span className="muted text-[11px]">称谓（礼簿上的称呼）</span>
                <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEntry(); }} placeholder="如：二舅 / 王总 / 表姐" style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">来宾姓名 *</span>
                <input ref={nameRef} className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEntry(); }} placeholder="如：张建国" style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">礼金金额（元）*</span>
                <input className="input" type="number" min={0} value={form.amount} onChange={(e) => set('amount', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEntry(); }} placeholder="如：800" style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">关系</span>
                <div className="flex flex-wrap gap-1">
                  {RELATIONS.map((r) => (
                    <button key={r} className={`chip !text-[11px] ${form.relation === r ? 'chip-active' : ''}`} onClick={() => set('relation', r)}>{r}</button>
                  ))}
                </div>
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">方属</span>
                <div className="flex gap-1">
                  {SIDES.map((s) => (
                    <button key={s.id} className={`chip !text-[11px] ${form.side === s.id ? 'chip-active' : ''}`} onClick={() => set('side', s.id)}>{s.name}</button>
                  ))}
                </div>
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">随礼形式</span>
                <select className="input" value={form.form} onChange={(e) => set('form', e.target.value as GiftForm)}>
                  {FORMS.map((f) => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">随礼人数</span>
                <input className="input" type="number" min={1} max={99} value={form.partySize} onChange={(e) => set('partySize', e.target.value)} style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">记账人</span>
                <input className="input" value={form.recorder} onChange={(e) => set('recorder', e.target.value)} placeholder={meta.recorder || '谁记的这笔'} style={inputStyle} />
              </label>
              <label className="grid gap-1">
                <span className="muted text-[11px]">日期</span>
                <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} style={inputStyle} />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="muted text-[11px]">实物礼品（可选，随礼形式为「礼物」时填）</span>
                <input className="input" value={form.gift} onChange={(e) => set('gift', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEntry(); }} placeholder="如：喜被一床 / 金镯一对 / 茅台两瓶" style={inputStyle} />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="muted text-[11px]">备注（关系细节 / 额外说明）</span>
                <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitEntry(); }} placeholder="如：大姑父，带姑姑一起来" style={inputStyle} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="muted text-[11px]">常用金额：</span>
              {[200, 400, 600, 800, 1000, 2000].map((v) => (
                <button key={v} className={`chip !text-[11px] ${form.amount === String(v) ? 'chip-active' : ''}`} onClick={() => set('amount', String(v))}>{v}</button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn primary" disabled={saving} onClick={submitEntry}>{saving ? '提交中…' : '记一笔' }</button>
              {formErr && <span className="text-[12px]" style={{ color: '#e5484d' }}>{formErr}</span>}
              {!entries.length && (
                <button className="btn sm" onClick={seedSample}>载入 8 条示例数据</button>
              )}
            </div>
          </div>
          <div className="card p-4">
            <span className="text-xs font-semibold muted">最近记录（{Math.min(entries.length, 5)}）</span>
            {!entries.length && <p className="muted mt-2 text-xs">还没有记录。现场从第一笔开始记，或先载入示例看看效果。</p>}
            <div className="mt-2 grid gap-1.5">
              {entries.slice(-5).reverse().map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
                  <span className="font-semibold">{displayName(e)}</span>
                  <span style={{ color: 'var(--accent)' }}>{money(e.amount)}</span>
                  {e.amount > 0 && <span className="muted text-[11px]">{toChineseAmount(e.amount)}</span>}
                  <span className="muted">{e.relation} · {sideLabel(e.side)} · {formLabel(e.form)}{e.partySize > 1 ? ` · ${e.partySize}人` : ''}</span>
                  <span className="muted text-[11px]">记账：{e.recorder || '——'}</span>
                  {(e.gift || e.note) && (
                    <span className="muted text-[11px]">
                      {e.gift ? `礼品：${e.gift}` : ''}
                      {e.gift && e.note ? ' · ' : ''}
                      {e.note ? `备注：${e.note}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ========== 礼账 ========== */}
      {tab === 'ledger' && (
        <>
          <div className="card p-4">
            <span className="text-xs font-semibold muted">筛选查询</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <input className="input" placeholder="搜姓名 / 备注 / 关系" value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              <select className="input" value={filter.relation} onChange={(e) => setFilter((f) => ({ ...f, relation: e.target.value }))}>
                <option value="">全部关系</option>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className="input" value={filter.side} onChange={(e) => setFilter((f) => ({ ...f, side: e.target.value }))}>
                <option value="">全部方属</option>
                {SIDES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="input" value={filter.form} onChange={(e) => setFilter((f) => ({ ...f, form: e.target.value }))}>
                <option value="">全部形式</option>
                {FORMS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select className="input" value={filter.recorder} onChange={(e) => setFilter((f) => ({ ...f, recorder: e.target.value }))}>
                <option value="">全部记账人</option>
                {[...new Set(entries.map((e) => e.recorder).filter(Boolean))].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex gap-1">
                <input className="input" type="date" value={filter.dateFrom} onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value }))} title="开始日期" />
                <input className="input" type="date" value={filter.dateTo} onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value }))} title="结束日期" />
              </div>
              <div className="flex gap-1">
                <input className="input" type="number" placeholder="金额≥" value={filter.min} onChange={(e) => setFilter((f) => ({ ...f, min: e.target.value }))} />
                <input className="input" type="number" placeholder="金额≤" value={filter.max} onChange={(e) => setFilter((f) => ({ ...f, max: e.target.value }))} />
              </div>
              <div className="flex gap-1">
                <select className="input" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort({ key: k, dir: d as 'asc' | 'desc' }); }}>
                  <option value="date:asc">日期 ↑</option>
                  <option value="date:desc">日期 ↓</option>
                  <option value="amount:desc">金额 高→低</option>
                  <option value="amount:asc">金额 低→高</option>
                  <option value="name:asc">姓名 A→Z</option>
                </select>
                <button className="btn sm" onClick={() => { setFilter(EMPTY_FILTER); setSort({ key: 'date', dir: 'asc' }); }}>重置</button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="card p-4"><div className="muted text-[11px]">礼金总额</div><div className="mt-1 text-2xl font-bold" style={{ color: 'var(--accent)' }}>{money(stats.total)}</div></div>
            <div className="card p-4"><div className="muted text-[11px]">笔数 / 人数</div><div className="mt-1 text-2xl font-bold">{stats.count} <span className="muted text-sm font-normal">/ {filtered.reduce((s, e) => s + (e.partySize || 1), 0)} 人</span></div></div>
            <div className="card p-4"><div className="muted text-[11px]">笔均</div><div className="mt-1 text-2xl font-bold">{money(stats.avg)}</div></div>
            <div className="card p-4"><div className="muted text-[11px]">最高单笔</div><div className="mt-1 text-2xl font-bold">{money(stats.max)}</div><div className="muted mt-0.5 text-[11px]">{stats.maxEntry ? `${stats.maxEntry.name}（${stats.maxEntry.relation}）` : '——'}</div></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-4">
              <span className="text-xs font-semibold muted">方属分布</span>
              <div className="mt-2 grid gap-1.5">
                {SIDES.map((s) => {
                  const v = stats.bySide[s.id];
                  const pct = stats.total ? Math.round((v / stats.total) * 100) : 0;
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-[12px]">
                      <span className="w-10 shrink-0">{s.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      <span className="muted w-24 shrink-0 text-right">{money(v)} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card p-4">
              <span className="text-xs font-semibold muted">关系分布</span>
              <div className="mt-2 grid gap-1.5">
                {stats.byRelation.slice(0, 6).map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-[12px]">
                    <span>{r.key}</span>
                    <span className="muted">{r.count} 笔 · {money(r.amount)}</span>
                  </div>
                ))}
                {!stats.byRelation.length && <p className="muted text-xs">暂无数据</p>}
              </div>
            </div>
            <div className="card p-4">
              <span className="text-xs font-semibold muted">记账人经手（谁写账 · 写了多少）</span>
              <div className="mt-2 grid gap-1.5">
                {stats.byRecorder.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-[12px]">
                    <span>{r.key}</span>
                    <span className="muted">{r.count} 笔 · {money(r.amount)}</span>
                  </div>
                ))}
                {!stats.byRecorder.length && <p className="muted text-xs">暂无数据</p>}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">礼账台账（{filtered.length} 笔，勾选可生成答谢卡）</span>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn sm" onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map((e) => e.id))}>
                  {selected.length === filtered.length && filtered.length ? '取消全选' : '全选当前筛选'}
                </button>
                <button className="btn sm" onClick={exportCsv}>导出 CSV</button>
                {session.role === 'admin' && (
                  <button className="btn sm" style={clearing ? { color: '#e5484d', borderColor: '#e5484d' } : undefined}
                    onClick={() => (clearing ? clearAll() : setClearing(true))}>
                    {clearing ? '再点一次确认清空' : '清空全部'}
                  </button>
                )}
              </div>
            </div>
            {clearing && <p className="mb-2 text-[12px]" style={{ color: '#e5484d' }}>将删除全部 {entries.length} 笔记录且不可恢复，建议先导出 CSV 备份。</p>}
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="muted text-[11px]" style={{ borderBottom: '1px solid var(--line)' }}>
                    <th className="p-2 text-left" style={{ width: 30 }}></th>
                    <th className="p-2 text-left">姓名</th>
                    <th className="p-2 text-right">礼金</th>
                    <th className="p-2 text-left">关系</th>
                    <th className="p-2 text-left">方属</th>
                    <th className="p-2 text-left">形式</th>
                    <th className="p-2 text-right">人数</th>
                    <th className="p-2 text-left">记账人</th>
                    <th className="p-2 text-left">日期</th>
                    <th className="p-2 text-left">备注</th>
                    <th className="p-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="p-2"><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggleSel(e.id)} /></td>
                      {editId === e.id ? (
                        <>
                          <td className="p-2 font-semibold">{displayName(e)}</td>
                          <td className="p-2 text-right"><input className="input" style={{ width: 80, textAlign: 'right' }} type="number" value={editDraft.amount} onChange={(ev) => setEditDraft((d) => ({ ...d, amount: ev.target.value }))} /></td>
                          <td className="p-2">{e.relation}</td>
                          <td className="p-2">{sideLabel(e.side)}</td>
                          <td className="p-2">{formLabel(e.form)}</td>
                          <td className="p-2 text-right">{e.partySize}</td>
                          <td className="p-2"><input className="input" style={{ width: 72 }} value={editDraft.recorder} onChange={(ev) => setEditDraft((d) => ({ ...d, recorder: ev.target.value }))} /></td>
                          <td className="p-2 muted">{e.date}</td>
                          <td className="p-2"><input className="input" style={{ width: 140 }} value={editDraft.note} onChange={(ev) => setEditDraft((d) => ({ ...d, note: ev.target.value }))} /></td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <button className="btn sm" onClick={() => saveEdit(e.id)}>保存</button>
                            <button className="btn sm ml-1" onClick={() => setEditId('')}>取消</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 font-semibold">{displayName(e)}</td>
                          <td className="p-2 text-right" style={{ color: 'var(--accent)' }}>{money(e.amount)}</td>
                          <td className="p-2">{e.relation}</td>
                          <td className="p-2">{sideLabel(e.side)}</td>
                          <td className="p-2">{formLabel(e.form)}</td>
                          <td className="p-2 text-right">{e.partySize}</td>
                          <td className="p-2">{e.recorder || '——'}</td>
                          <td className="p-2 muted">{e.date}</td>
                          <td className="p-2 muted">{e.note || '——'}</td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <button className="btn sm" onClick={() => startEdit(e)}>改</button>
                            <button className="btn sm ml-1" style={delArmed === e.id ? { color: '#e5484d', borderColor: '#e5484d' } : undefined}
                              onClick={() => (delArmed === e.id ? delEntry(e.id) : setDelArmed(e.id))}>
                              {delArmed === e.id ? '确认删' : '删'}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr><td colSpan={11} className="muted p-6 text-center">没有符合条件的记录{entries.length ? '，试试重置筛选' : '，先去「记账」页记第一笔'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========== 成册 ========== */}
      {tab === 'album' && (
        <>
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold muted">婚礼信息（印在封面和页眉）</span>
              <button className="btn sm primary" disabled={metaSaving} onClick={() => saveMeta(metaDraft)}>{metaSaving ? '保存中…' : '保存信息'}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <label className="grid gap-1"><span className="muted text-[11px]">新郎</span><input className="input" value={metaDraft.groom} onChange={(e) => setMetaDraft((m) => ({ ...m, groom: e.target.value }))} placeholder="赵" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">新娘</span><input className="input" value={metaDraft.bride} onChange={(e) => setMetaDraft((m) => ({ ...m, bride: e.target.value }))} placeholder="陈" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">婚期</span><input className="input" type="date" value={metaDraft.date} onChange={(e) => setMetaDraft((m) => ({ ...m, date: e.target.value }))} /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">宴席</span><input className="input" value={metaDraft.banquet} onChange={(e) => setMetaDraft((m) => ({ ...m, banquet: e.target.value }))} placeholder="中式答谢宴" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">地点</span><input className="input" value={metaDraft.venue} onChange={(e) => setMetaDraft((m) => ({ ...m, venue: e.target.value }))} placeholder="XX 酒店 3F 宴会厅" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">司账人</span><input className="input" value={metaDraft.recorder} onChange={(e) => setMetaDraft((m) => ({ ...m, recorder: e.target.value }))} placeholder="爸爸" /></label>
            </div>
          </div>

          <div className="card p-4">
            <span className="text-xs font-semibold muted">手写字体（模拟人手写，Google Fonts 中文字体，国内自动走镜像）</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {HAND_FONTS.map((f) => (
                <button key={f.id} className="rounded-lg p-2.5 text-left" onClick={() => setFontId(f.id)}
                  style={{
                    border: `1.5px solid ${fontId === f.id ? 'var(--accent, #ef7d3a)' : 'var(--line, #e5e7eb)'}`,
                    background: fontId === f.id ? 'var(--chip-bg, #fff7ef)' : 'transparent',
                  }}>
                  <div style={{ fontFamily: f.css, fontSize: 20 }}>永结同心</div>
                  <div className="mt-1 text-[12px] font-semibold">{f.name}</div>
                  <div className="muted mt-0.5 text-[11px] leading-relaxed">{f.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">卡纸模板与成册选项</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="muted text-[11px]">每页行数</span>
                {[16, 20, 26].map((n) => (
                  <button key={n} className={`chip !text-[11px] ${rowsPerPage === n ? 'chip-active' : ''}`} onClick={() => setRowsPerPage(n)}>{n}</button>
                ))}
                <button className={`chip !text-[11px] ${jitter ? 'chip-active' : ''}`} onClick={() => setJitter((v) => !v)}>手写抖动</button>
                <span className="muted ml-2 text-[11px]">范围</span>
                <button className={`chip !text-[11px] ${scope === 'all' ? 'chip-active' : ''}`} onClick={() => setScope('all')}>全部 {entries.length}</button>
                <button className={`chip !text-[11px] ${scope === 'filtered' ? 'chip-active' : ''}`} onClick={() => setScope('filtered')}>当前筛选 {filtered.length}</button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {BOOK_TEMPLATES.map((t) => (
                <button key={t.id} className="rounded-lg p-2.5 text-left" onClick={() => setTemplateId(t.id)}
                  style={{
                    border: `1.5px solid ${templateId === t.id ? 'var(--accent, #ef7d3a)' : 'var(--line, #e5e7eb)'}`,
                    background: templateId === t.id ? 'var(--chip-bg, #fff7ef)' : 'transparent',
                  }}>
                  <div className="text-[13px] font-semibold">{t.name}</div>
                  <div className="muted mt-0.5 text-[11px] leading-relaxed">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn primary" onClick={() => printAfterFonts()}>打印礼账簿</button>
              <span className="muted text-[11px]">
                打印走浏览器打印对话框：目标打印机选系统已连接的打印机即可输出卡纸；也可「另存为 PDF」拿去打印店。
                3D 打印机无法直接输出纸张，实体卡纸请用 A4/A5 卡纸经普通打印机输出。
              </span>
            </div>
          </div>

          <LedgerBook meta={meta} entries={albumEntries} fontId={fontId} templateId={templateId} rowsPerPage={rowsPerPage} jitter={jitter} />
        </>
      )}

      {/* ========== 谢卡 ========== */}
      {tab === 'cards' && (
        <>
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">
                答谢卡范围：{selectedEntries.length ? `已选 ${selectedEntries.length} 人` : `未勾选，按当前筛选 ${filtered.length} 人`}
                {!selectedEntries.length && !filtered.length && `（筛选为空，按全部 ${entries.length} 人）`}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {HAND_FONTS.slice(0, 3).map((f) => (
                  <button key={f.id} className={`chip !text-[11px] ${fontId === f.id ? 'chip-active' : ''}`} style={{ fontFamily: f.css }} onClick={() => setFontId(f.id)}>{f.name}</button>
                ))}
                {BOOK_TEMPLATES.map((t) => (
                  <button key={t.id} className={`chip !text-[11px] ${templateId === t.id ? 'chip-active' : ''}`} onClick={() => setTemplateId(t.id)}>{t.name}</button>
                ))}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="muted text-[11px]">致谢模板（{'{name}'} 会替换为来宾姓名）</span>
              <textarea className="input" rows={3} value={thanksDraft} onChange={(e) => setThanksDraft(e.target.value)} />
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button className="btn sm" disabled={thanksSaving} onClick={saveThanks}>{thanksSaving ? '保存中…' : '保存模板'}</button>
              <button className="btn sm" onClick={() => setThanksDraft(meta.thanks)}>还原</button>
              <button className="btn primary" onClick={() => printAfterFonts()}>打印答谢卡</button>
              <span className="muted text-[11px]">A4 一页 4 张，沿裁切线裁切即可送人</span>
            </div>
          </div>
          <ThanksCards meta={meta} entries={cardEntries} fontId={fontId} templateId={templateId} thanksTemplate={thanksDraft} />
        </>
      )}

      {/* ========== 账户（仅管理员） ========== */}
      {tab === 'account' && session.role === 'admin' && (
        <AdminPanel onLogout={doLogout} />
      )}
    </div>
  );
}

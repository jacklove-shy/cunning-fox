import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { http } from '../../lib/api';
import { getSession, isAuthed, logout, setSession, type Session } from '../../lib/auth';

/* ============================================================
 * 清北成长助手：目标拆解 + 弱科诊断 + 全网课程导航 + 学习方法
 *  - 看板：目标总分反推每科分数线，当前/目标对比，月考记录
 *  - 课程导航：本地不存视频，按「年级 × 学科 × 类型」收录全网官方与优质免费入口
 *  - 学习方法：内置 8 套可执行的学习方法（费曼、错题本、三遍真题…）
 *  - 查漏补缺：雷达图算出弱科，自动把对应课程顶到最前面
 * 数据存博客 MySQL，同一账号多端同步。
 * ============================================================ */

interface QingbeiProfile {
  id: string; name: string; grade: string; province: string; city: string; county: string;
  targetSchool: string; targetMajor: string; track: '物理' | '历史';
  electives: string[]; examMode: string; gaokaoDate: string;
}
interface QingbeiReference {
  school: string; mode?: string;
  years: { year: number; score: number; rank: number }[];
  note?: string;
}
interface QingbeiTarget {
  profileId: string; totalTarget: number; perSubject: Record<string, number>; reference: QingbeiReference;
}
interface QingbeiRecord {
  id: string; subject: string; score: number; fullMark: number; examName: string; examDate: string; createdAt?: string;
}
interface QingbeiPaper { id: string; subject: string; examName: string; examDate: string; createdAt?: string }
interface QingbeiPoint { id: string; paperId: string; subject: string; qNo: string; score: number; fullMark: number; isCorrect: boolean; reason: string; knowledgePoints: string[]; createdAt?: string }
interface WeakSubj { subject: string; lostRate: number; lost: number; wrong: number; total: number }
interface WeakKP { kp: string; subject: string; lost: number; wrong: number; count: number; weight: number }
interface QingbeiWQ {
  id: string; subject: string; knowledgePoints: string[]; question: string; myAnswer: string; correctAnswer: string;
  reason: string; reflection: string; difficulty: number; reviewCount: number; nextReviewAt: string; createdAt?: string;
}
interface Resource {
  id: string; title: string; provider: string;
  kind: 'site' | 'search'; url?: string; keyword?: string;
  grades: string[]; subjects: string[]; type: string; desc?: string; top?: number;
}
interface StudyMethod { id: string; name: string; scene: string; steps: string[]; tip?: string }

/** 河北新高考各科满分：语数英 150，选考（物/史/化/生/政/地）100 */
const SUBJECT_FULL: Record<string, number> = {
  语文: 150, 数学: 150, 英语: 150, 物理: 100, 历史: 100, 化学: 100, 生物: 100, 政治: 100, 地理: 100,
};
const fullOf = (s: string) => SUBJECT_FULL[s] || 100;
const ALL_ELECTIVES = ['化学', '生物', '政治', '地理'];
const TRACKS: ('物理' | '历史')[] = ['物理', '历史'];
const GRADES = ['高一', '高二', '高三'];

const todayStr = () => new Date().toISOString().slice(0, 10);
function daysUntil(date: string): number {
  const d = new Date(date + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

/** 每个科目取最近一次考试记录（exam_date 最新，其次 createdAt） */
function latestBySubject(records: QingbeiRecord[]): Map<string, QingbeiRecord> {
  const m = new Map<string, QingbeiRecord>();
  for (const r of records) {
    const cur = m.get(r.subject);
    if (!cur || r.examDate > cur.examDate || (r.examDate === cur.examDate && (r.createdAt || '') > (cur.createdAt || ''))) {
      m.set(r.subject, r);
    }
  }
  return m;
}

/** 资源外链：搜索型统一走 B 站搜索（永不失效），站点型直连官方地址 */
function resourceUrl(r: Resource): string {
  if (r.kind === 'search') return `https://search.bilibili.com/all?keyword=${encodeURIComponent(r.keyword || r.title)}`;
  return r.url || '#';
}

/* ---------------- 雷达图（手写 SVG，无图表依赖） ---------------- */
function RadarChart({ labels, current, target }: { labels: string[]; current: number[]; target: number[] }) {
  const size = 260, cx = size / 2, cy = size / 2, R = 92, n = labels.length || 1;
  const pt = (i: number, r: number): [number, number] => {
    const ang = ((-90 + (360 * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(i, R * Math.max(0, Math.min(1, v))).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 300, margin: '0 auto', display: 'block' }}>
      {rings.map((rr, i) => (
        <polygon key={i} points={labels.map((_, k) => pt(k, R * rr).join(',')).join(' ')} fill="none" stroke="var(--line,#e5e7eb)" strokeWidth={0.5} />
      ))}
      {labels.map((_, k) => {
        const [x, y] = pt(k, R);
        return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line,#e5e7eb)" strokeWidth={0.5} />;
      })}
      <polygon points={poly(target)} fill="rgba(56,138,221,0.18)" stroke="#378ADD" strokeWidth={1.5} />
      <polygon points={poly(current)} fill="rgba(22,163,74,0.18)" stroke="#16a34a" strokeWidth={1.5} />
      {labels.map((lb, k) => {
        const [x, y] = pt(k, R + 14);
        return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--muted,#667085)">{lb}</text>;
      })}
    </svg>
  );
}

function SubjectBar({ label, current, target, full }: { label: string; current: number; target: number; full: number }) {
  const curPct = Math.min(100, (current / full) * 100);
  const tgtPct = Math.min(100, (target / full) * 100);
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[12px]">
        <span>{label}</span>
        <span className="muted">{current}/{full} <span style={{ color: '#378ADD' }}>目标 {target}</span></span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--line,#e5e7eb)' }}>
        <div style={{ width: `${curPct}%`, height: '100%', background: '#16a34a' }} />
        <div style={{ position: 'absolute', top: -2, left: `${tgtPct}%`, width: 2, height: 10, background: '#378ADD' }} />
      </div>
    </div>
  );
}

/* ---------------- 登录门槛 ---------------- */
function Login({ onOk }: { onOk: (s: Session) => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    if (!username || !password) { setErr('用户名和密码必填'); return; }
    setBusy(true); setErr('');
    try {
      const r = await http.post<{ token: string; exp: number; username: string; role: 'admin' | 'user' }>('/auth/login', { username, password });
      const s: Session = { token: r.token, username: r.username, role: r.role, exp: r.exp };
      setSession(s);
      onOk(s);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card p-6" style={{ maxWidth: 380, margin: '0 auto' }}>
      <h3 className="text-base font-semibold">清北成长助手 · 登录</h3>
      <p className="muted mt-1 text-[11px] leading-relaxed">
        学习数据存在博客数据库，登录后可在手机、电脑同步查看。首次使用：<b>admin / admin1234</b>，建议尽快改密。
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label className="grid gap-1"><span className="muted text-[11px]">用户名</span><input name="username" autoComplete="username" className="input" autoFocus placeholder="admin" /></label>
        <label className="grid gap-1"><span className="muted text-[11px]">密码</span><input name="password" type="password" autoComplete="current-password" className="input" placeholder="••••••••" /></label>
        {err && <span className="text-[12px]" style={{ color: '#e5484d' }}>{err}</span>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  );
}

/* ---------------- 课程资源卡片 ---------------- */
function ResourceCard({ r, weak }: { r: Resource; weak: boolean }) {
  return (
    <a
      href={resourceUrl(r)}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover block p-4"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold leading-snug">{r.title}</div>
          {r.desc && <p className="muted mt-1 text-[11.5px] leading-relaxed">{r.desc}</p>}
        </div>
        <span className="muted shrink-0 text-[12px]">↗</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="chip !py-0 !text-[10.5px]">{r.type}</span>
        <span className="chip !py-0 !text-[10.5px]">{r.provider}</span>
        {r.subjects.map((s) => <span key={s} className="chip !py-0 !text-[10.5px]">{s}</span>)}
        {r.kind === 'search' && <span className="chip !py-0 !text-[10.5px]">B站搜索</span>}
        {weak && <span className="chip !py-0 !text-[10.5px]" style={{ color: '#e5484d', borderColor: '#e5484d' }}>弱科优先</span>}
      </div>
    </a>
  );
}

/* ---------------- 主组件 ---------------- */
export function QingbeiCoach() {
  // 所有 hook 必须在任何 early return 之前声明，否则 React 会报 hook 数量不一致导致整页崩溃。
  const [session, setSessionState] = useState<Session | null>(() => (isAuthed() ? getSession() : null));
  const [tab, setTab] = useState<'board' | 'courses' | 'methods' | 'diagnose' | 'wq' | 'settings'>('board');
  const [profile, setProfile] = useState<QingbeiProfile | null>(null);
  const [target, setTarget] = useState<QingbeiTarget | null>(null);
  const [records, setRecords] = useState<QingbeiRecord[]>([]);
  const [wqList, setWQList] = useState<QingbeiWQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const login = (s: Session) => { setSessionState(s); };
  const doLogout = () => { logout(); setSessionState(null); setProfile(null); setTarget(null); setRecords([]); };

  const load = useCallback(async () => {
    try {
      const [d, an, wq] = await Promise.all([
        http.get<{ profile: QingbeiProfile; target: QingbeiTarget; records: QingbeiRecord[] }>('/qingbei'),
        http.get<{ papers: QingbeiPaper[]; points: QingbeiPoint[]; weaknessBySubject: WeakSubj[]; weaknessByKP: WeakKP[] }>('/qingbei/analysis'),
        http.get<{ items: QingbeiWQ[] }>('/qingbei/wrong-questions'),
      ]);
      setProfile(d.profile); setTarget(d.target); setRecords(d.records || []);
      setPapers(an.papers || []); setPoints(an.points || []); setWeakSubj(an.weaknessBySubject || []); setWeakKP(an.weaknessByKP || []);
      setWQList(wq.items || []);
      setLoadErr('');
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (session) load(); else setLoading(false); }, [load, session]);

  /* ----- 课程库 / 方法库 ----- */
  const [resources, setResources] = useState<Resource[]>([]);
  const [methods, setMethods] = useState<StudyMethod[]>([]);
  const [resErr, setResErr] = useState('');
  const [gradePick, setGradePick] = useState('');   // '' = 跟随学习档案里的年级
  const [subjectPick, setSubjectPick] = useState('');
  const [typePick, setTypePick] = useState('');
  const [kw, setKw] = useState('');
  const [openMethod, setOpenMethod] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    http.get<{ items: Resource[]; methods: StudyMethod[] }>('/qingbei/resources')
      .then((d) => { if (!alive) return; setResources(d.items || []); setMethods(d.methods || []); setResErr(''); })
      .catch((e) => { if (alive) setResErr((e as Error).message); });
    return () => { alive = false; };
  }, [session]);

  // 以下 hook 同样需要在 early return 之前声明（与上方保持顺序稳定）
  const latest = useMemo(() => latestBySubject(records), [records]);
  const [form, setForm] = useState<{ subject: string; score: string; fullMark: string; examName: string; examDate: string }>(
    () => ({ subject: '语文', score: '', fullMark: '150', examName: '', examDate: todayStr() }),
  );
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [pDraft, setPDraft] = useState<QingbeiProfile | null>(null);
  const [tDraft, setTDraft] = useState<QingbeiTarget | null>(null);
  const [pSaving, setPSaving] = useState(false);
  const [tSaving, setTSaving] = useState(false);
  useEffect(() => { if (profile) setPDraft(profile); }, [profile]);
  useEffect(() => { if (target) setTDraft(target); }, [target]);

  /* ----- 试卷诊断状态（录入 + 弱知识点 + 历史） ----- */
  const [papers, setPapers] = useState<QingbeiPaper[]>([]);
  const [points, setPoints] = useState<QingbeiPoint[]>([]);
  const [weakSubj, setWeakSubj] = useState<WeakSubj[]>([]);
  const [weakKP, setWeakKP] = useState<WeakKP[]>([]);
  interface DiagRow { qNo: string; score: string; fullMark: string; isCorrect: boolean; reason: string; kps: string }
  const emptyDiag = (subj: string): { subject: string; examName: string; examDate: string; rows: DiagRow[] } => ({
    subject: subj, examName: '', examDate: todayStr(),
    rows: [{ qNo: '', score: '', fullMark: String(fullOf(subj)), isCorrect: true, reason: '其他', kps: '' }],
  });
  const [diag, setDiag] = useState<{ subject: string; examName: string; examDate: string; rows: DiagRow[] }>(() => emptyDiag('语文'));
  const [diagErr, setDiagErr] = useState('');
  const [diagSaving, setDiagSaving] = useState(false);

  /* ----- 错题本状态（三栏法 + 间隔复习） ----- */
  const [wqSubject, setWQSubject] = useState(''); // 错题本内筛选
  const [wqForm, setWQForm] = useState<{ subject: string; kps: string; reason: string; difficulty: number; question: string; myAnswer: string; correctAnswer: string; reflection: string }>(
    () => ({ subject: '', kps: '', reason: '其他', difficulty: 3, question: '', myAnswer: '', correctAnswer: '', reflection: '' }),
  );
  const [wqErr, setWQErr] = useState('');
  const [wqSaving, setWQSaving] = useState(false);
  const [wqOpen, setWQOpen] = useState<string | null>(null);
  // 目标科目加载后，若默认「语文」不在其中则切到第一个科目（满分同步调整）
  useEffect(() => {
    if (!tDraft) return;
    if (!tDraft.perSubject[form.subject]) {
      const first = Object.keys(tDraft.perSubject)[0];
      if (first) setForm((f) => ({ ...f, subject: first, fullMark: String(fullOf(first)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tDraft]);

  /** 弱科排行：按「距离目标还差多少（占满分比例）」降序，只统计已录入成绩的科目 */
  const weakList = useMemo(() => {
    if (!target) return [] as { subject: string; gap: number; pct: number }[];
    const arr: { subject: string; gap: number; pct: number }[] = [];
    for (const s of Object.keys(target.perSubject)) {
      const rec = latest.get(s);
      if (!rec) continue;
      const gap = (target.perSubject[s] || 0) - Number(rec.score);
      if (gap > 0) arr.push({ subject: s, gap: Math.round(gap * 10) / 10, pct: gap / fullOf(s) });
    }
    arr.sort((a, b) => b.pct - a.pct);
    return arr.slice(0, 3);
  }, [target, latest]);

  /** 今日待复习的错题：nextReviewAt <= 今天 */
  const wqDue = useMemo(() => wqList.filter((w) => w.nextReviewAt && w.nextReviewAt <= todayStr()), [wqList]);

  /** 课程列表：年级 → 学科 → 类型 → 关键词，弱科资源自动置顶 */
  const filteredResources = useMemo(() => {
    const myGrade = profile && GRADES.includes(profile.grade) ? profile.grade : '高一';
    const grade = gradePick || myGrade;
    const key = kw.trim().toLowerCase();
    const weakTop = weakList.slice(0, 2).map((w) => w.subject);
    return resources
      .filter((r) => !r.grades?.length || r.grades.includes(grade))
      .filter((r) => !subjectPick || r.subjects.includes(subjectPick) || r.subjects.includes('全科'))
      .filter((r) => !typePick || r.type === typePick)
      .filter((r) => {
        if (!key) return true;
        const hay = `${r.title}${r.desc || ''}${r.provider}${r.subjects.join('')}${r.type}`.toLowerCase();
        return hay.includes(key);
      })
      .sort((a, b) => {
        const ba = weakTop.some((s) => a.subjects.includes(s)) ? 0 : 1;
        const bb = weakTop.some((s) => b.subjects.includes(s)) ? 0 : 1;
        return ba - bb || (a.top ?? 9) - (b.top ?? 9);
      });
  }, [resources, gradePick, subjectPick, typePick, kw, weakList, profile]);

  const resTypes = useMemo(() => Array.from(new Set(resources.map((r) => r.type))), [resources]);
  const resSubjects = useMemo(() => {
    const s = new Set<string>();
    resources.forEach((r) => r.subjects.forEach((x) => { if (x !== '全科') s.add(x); }));
    return Array.from(s);
  }, [resources]);

  /* ----- early returns（所有 hook 已声明，可安全提前返回） ----- */
  if (!session) return <Login onOk={login} />;
  if (loading) return <div className="card p-6 muted text-sm">正在加载成长数据…</div>;
  if (loadErr) return (<div className="card p-6"><p className="text-sm" style={{ color: '#e5484d' }}>加载失败：{loadErr}</p><button className="btn sm mt-2" onClick={load}>重试</button></div>);
  if (!profile || !target || !pDraft || !tDraft) return <div className="card p-6 muted text-sm">暂无数据。</div>;

  /* ----- 试卷诊断：提交 / 增删行 / 删除 / 课程推荐（均为普通函数，不违反 hook 顺序） ----- */
  const recommendForKP = (kp: string, subject: string) => {
    const key = kp.toLowerCase();
    const items = resources.filter((r) =>
      (r.subjects.includes(subject) || r.subjects.includes('全科')) &&
      `${r.title}${r.desc || ''}${r.type}${r.subjects.join('')}`.toLowerCase().includes(key),
    );
    const searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${subject} ${kp} 知识点讲解`)}`;
    return { items, searchUrl };
  };
  const onDiagSubject = (s: string) =>
    setDiag((d) => ({ ...d, subject: s, rows: d.rows.map((r) => ({ ...r, fullMark: String(fullOf(s)) })) }));
  const addDiagRow = () =>
    setDiag((d) => ({ ...d, rows: [...d.rows, { qNo: '', score: '', fullMark: String(fullOf(d.subject)), isCorrect: true, reason: '其他', kps: '' }] }));
  const delDiagRow = (i: number) =>
    setDiag((d) => ({ ...d, rows: d.rows.length > 1 ? d.rows.filter((_, k) => k !== i) : d.rows }));
  const setRow = (i: number, patch: Partial<DiagRow>) =>
    setDiag((d) => ({ ...d, rows: d.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const submitDiag = async () => {
    const rows = diag.rows
      .map((r) => {
        const scoreStr = r.score.trim(); const fullStr = r.fullMark.trim();
        const score = Number(scoreStr); const fullMark = Number(fullStr);
        return {
          qNo: r.qNo, score, fullMark,
          scoreFilled: scoreStr !== '', fullFilled: fullStr !== '' && fullMark > 0,
          isCorrect: r.isCorrect, reason: r.reason,
          knowledgePoints: r.kps.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
        };
      })
      .filter((r) => r.scoreFilled && r.fullFilled);
    if (!diag.subject) return setDiagErr('请选择科目');
    if (!rows.length) return setDiagErr('至少填一道题的分数');
    setDiagSaving(true); setDiagErr('');
    try {
      await http.post<{ paper: QingbeiPaper; points: QingbeiPoint[] }>('/qingbei/analysis', {
        subject: diag.subject, examName: diag.examName.trim(), examDate: diag.examDate, points: rows,
      });
      setDiag(emptyDiag(diag.subject));
      await load();
    } catch (e) { setDiagErr((e as Error).message); } finally { setDiagSaving(false); }
  };
  const delPaper = async (id: string) => {
    if (!confirm('删除这份试卷及其失分点？')) return;
    try { await http.del(`/qingbei/papers/${id}`); await load(); } catch (e) { alert((e as Error).message); }
  };

  /* ----- 错题本：录入 / 复习 / 删除（间隔复习 1-2-4-7-15） ----- */
  const submitWQ = async () => {
    if (!wqForm.subject) return setWQErr('请选择科目');
    if (!wqForm.question.trim() && !wqForm.myAnswer.trim() && !wqForm.correctAnswer.trim()) return setWQErr('至少填「错题/我的做法」或「正确解法」之一');
    setWQSaving(true); setWQErr('');
    try {
      await http.post<QingbeiWQ>('/qingbei/wrong-questions', {
        subject: wqForm.subject,
        knowledgePoints: wqForm.kps.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
        reason: wqForm.reason, difficulty: wqForm.difficulty,
        question: wqForm.question.trim(), myAnswer: wqForm.myAnswer.trim(),
        correctAnswer: wqForm.correctAnswer.trim(), reflection: wqForm.reflection.trim(),
      });
      setWQForm((f) => ({ ...f, kps: '', question: '', myAnswer: '', correctAnswer: '', reflection: '' }));
      setWQOpen(null);
      await load();
    } catch (e) { setWQErr((e as Error).message); } finally { setWQSaving(false); }
  };
  const reviewWQ = async (id: string) => {
    try { await http.patch(`/qingbei/wrong-questions/${id}`, { review: true }); await load(); } catch (e) { alert((e as Error).message); }
  };
  const delWQ = async (id: string) => {
    if (!confirm('删除这道错题？')) return;
    try { await http.del(`/qingbei/wrong-questions/${id}`); await load(); } catch (e) { alert((e as Error).message); }
  };
  const wqKPSearch = (subject: string, kp: string) =>
    `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${subject} ${kp} 知识点讲解`)}`;

  /* ----- 派生值（此时 profile/target 一定非空，可安全展开） ----- */
  const subjects = Object.keys(target.perSubject);
  const currentBySubject = subjects.map((s) => (latest.get(s) ? Number(latest.get(s)!.score) : 0));
  const currentTotal = currentBySubject.reduce((a, b) => a + b, 0);
  const gap = target.totalTarget - currentTotal;
  const reachPct = target.totalTarget > 0 ? Math.round((currentTotal / target.totalTarget) * 100) : 0;
  const radarCurrent = subjects.map((s) => (latest.get(s) ? Number(latest.get(s)!.score) : 0) / fullOf(s));
  const radarTarget = subjects.map((s) => (target.perSubject[s] || 0) / fullOf(s));
  const days = daysUntil(profile.gaokaoDate);
  const myGrade = GRADES.includes(profile.grade) ? profile.grade : '高一';
  const activeGrade = gradePick || myGrade;
  const weakTop = weakList.slice(0, 2).map((w) => w.subject);
  const tabBtn = (k: typeof tab, label: string) => (
    <button className={`chip ${tab === k ? 'chip-active' : ''}`} onClick={() => setTab(k)}>{label}</button>
  );
  /** 从看板跳到课程导航，并只看某一科 */
  const goCourses = (subject?: string) => {
    setTab('courses');
    setSubjectPick(subject || '');
    setTypePick('');
    setKw('');
    setGradePick('');
  };

  /* ----- 录入月考 ----- */
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const onSubjectChange = (s: string) => setForm((f) => ({ ...f, subject: s, fullMark: String(fullOf(s)) }));

  const submitRecord = async () => {
    const score = Number(form.score);
    const fullMark = Number(form.fullMark);
    if (!form.subject) return setFormErr('请选择科目');
    if (!Number.isFinite(score) || score < 0) return setFormErr('请填正确分数');
    if (!Number.isFinite(fullMark) || fullMark <= 0) return setFormErr('请填正确满分');
    setSaving(true); setFormErr('');
    try {
      await http.post<QingbeiRecord>('/qingbei/records', { subject: form.subject, score, fullMark, examName: form.examName.trim(), examDate: form.examDate });
      setForm((f) => ({ ...f, score: '', examName: '' }));
      await load();
    } catch (e) { setFormErr((e as Error).message); } finally { setSaving(false); }
  };
  const delRecord = async (id: string) => {
    try { await http.del(`/qingbei/records/${id}`); await load(); } catch (e) { alert((e as Error).message); }
  };

  /* ----- 设置（档案 + 目标） ----- */
  const saveProfile = async () => {
    setPSaving(true);
    try { const p = await http.put<QingbeiProfile>('/qingbei/profile', pDraft); setProfile(p); }
    catch (e) { alert((e as Error).message); } finally { setPSaving(false); }
  };
  const saveTarget = async () => {
    setTSaving(true);
    try { const t = await http.put<QingbeiTarget>('/qingbei/target', tDraft); setTarget(t); }
    catch (e) { alert((e as Error).message); } finally { setTSaving(false); }
  };
  const toggleElective = (s: string) => {
    setPDraft((d) => {
      if (!d) return d;
      if (d.electives.includes(s)) return { ...d, electives: d.electives.filter((x) => x !== s) };
      if (d.electives.length >= 2) return d;
      return { ...d, electives: [...d.electives, s] };
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="muted text-[11px]">
          {profile.province}·{profile.city}·{profile.county} · {profile.grade} · 目标 {profile.targetSchool}
        </span>
        <div className="flex items-center gap-2">
          <span className="chip !py-0.5 text-[11px]" style={{ color: '#e5484d', borderColor: '#e5484d' }}>距高考 D-{days}</span>
          <button className="btn sm" onClick={doLogout}>退出登录</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabBtn('board', '看板')}
        {tabBtn('courses', '课程导航')}
        {tabBtn('methods', '学习方法')}
        {tabBtn('diagnose', '诊断')}
        {tabBtn('wq', '错题本')}
        {tabBtn('settings', '设置')}
      </div>

      {tab === 'board' && (
        <>
          {/* 目标 vs 当前 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4"><div className="muted text-[11px]">清北目标总分</div><div className="mt-1 text-2xl font-bold" style={{ color: 'var(--accent)' }}>{target.totalTarget}</div></div>
            <div className="card p-4"><div className="muted text-[11px]">当前总分（按最近一次）</div><div className="mt-1 text-2xl font-bold">{currentTotal}</div><div className="muted mt-0.5 text-[11px]">达成率 {reachPct}%</div></div>
            <div className="card p-4"><div className="muted text-[11px]">距清北还差</div><div className="mt-1 text-2xl font-bold" style={{ color: gap > 0 ? '#e5484d' : '#16a34a' }}>{gap > 0 ? gap : '已达标'}</div></div>
          </div>

          {/* 每科差距 + 雷达 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <span className="text-xs font-semibold muted">每科差距（绿=当前，蓝线=目标）</span>
              <div className="mt-3 grid gap-3">
                {subjects.map((s) => (
                  <SubjectBar key={s} label={s} current={latest.get(s) ? Number(latest.get(s)!.score) : 0} target={target.perSubject[s] || 0} full={fullOf(s)} />
                ))}
                {!subjects.length && <p className="muted text-xs">还没有设定目标科目，去「设置」里填。</p>}
              </div>
            </div>
            <div className="card p-4">
              <span className="text-xs font-semibold muted">能力雷达（当前 vs 目标）</span>
              {subjects.length >= 3 ? (
                <RadarChart labels={subjects} current={radarCurrent} target={radarTarget} />
              ) : (
                <p className="muted mt-3 text-xs">设定至少 3 个科目后显示雷达图。</p>
              )}
              <div className="mt-2 flex justify-center gap-4 text-[11px] muted">
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2 }} /> 当前</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#378ADD', borderRadius: 2 }} /> 目标</span>
              </div>
            </div>
          </div>

          {/* 查漏补缺：弱科 → 直接跳课程 */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">查漏补缺（按差距从大到小）</span>
              <button className="btn sm" onClick={() => goCourses()}>全部课程 →</button>
            </div>
            {weakList.length ? (
              <div className="mt-3 grid gap-2">
                {weakList.map((w) => (
                  <div key={w.subject} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                    <span className="font-semibold">{w.subject}</span>
                    <span className="muted">距目标差 <b style={{ color: '#e5484d' }}>{w.gap}</b> 分（占满分 {Math.round(w.pct * 100)}%）</span>
                    <button className="btn sm ml-auto !py-0.5 !text-[11px]" onClick={() => goCourses(w.subject)}>补这一科</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted mt-2 text-xs">还没有成绩数据。先在下面记一次月考，这里会自动算出该先补哪一科。</p>
            )}
            {weakKP.length > 0 && (
              <button className="btn sm mt-2" onClick={() => setTab('diagnose')}>已诊断 {weakKP.length} 个薄弱知识点，去「诊断」看讲解视频 →</button>
            )}
          </div>

          {/* 今日待复习（错题本间隔复习提醒） */}
          {wqDue.length > 0 && (
            <div className="card p-4" style={{ borderColor: '#e5484d' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: '#e5484d' }}>今日待复习错题（{wqDue.length}）</span>
                <button className="btn sm" onClick={() => setTab('wq')}>去复习 →</button>
              </div>
              <div className="mt-2 grid gap-1.5">
                {wqDue.slice(0, 5).map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                    <span className="font-semibold">{w.subject}</span>
                    {w.knowledgePoints.slice(0, 2).map((k) => <span key={k} className="chip !py-0 !text-[10.5px]">{k}</span>)}
                    <span className="muted text-[11px]">已复习 {w.reviewCount} 次</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 录取参考 */}
          <div className="card p-4">
            <span className="text-xs font-semibold muted">清北河北投档参考（示例值，以官方为准）</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {target.reference.years.map((y) => (
                <div key={y.year} className="chip !text-[11px]">{y.year} 年 {y.score} 分 · 位次 {y.rank}</div>
              ))}
            </div>
            {target.reference.note && <p className="muted mt-2 text-[11px]">{target.reference.note}</p>}
          </div>

          {/* 月考录入 + 列表 */}
          <div className="card p-4">
            <span className="text-xs font-semibold muted">记一次月考 / 测验</span>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1"><span className="muted text-[11px]">科目</span>
                <select className="input" value={form.subject} onChange={(e) => onSubjectChange(e.target.value)}>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">分数</span><input className="input" type="number" value={form.score} onChange={(e) => set('score', e.target.value)} placeholder="如 120" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">满分</span><input className="input" type="number" value={form.fullMark} onChange={(e) => set('fullMark', e.target.value)} /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">考试名</span><input className="input" value={form.examName} onChange={(e) => set('examName', e.target.value)} placeholder="如 月考" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">日期</span><input className="input" type="date" value={form.examDate} onChange={(e) => set('examDate', e.target.value)} /></label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn primary" disabled={saving} onClick={submitRecord}>{saving ? '提交中…' : '记一笔'}</button>
              {formErr && <span className="text-[12px]" style={{ color: '#e5484d' }}>{formErr}</span>}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold muted">月考记录（{records.length}）</span>
            </div>
            {!records.length && <p className="muted text-xs">还没有记录。每次月考记一笔，雷达图和差距就会动起来。</p>}
            <div className="grid gap-1.5">
              {records.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                  <span className="font-semibold">{r.subject}</span>
                  <span style={{ color: 'var(--accent)' }}>{r.score}/{r.fullMark}</span>
                  <span className="muted">{r.examName || '测验'}</span>
                  <span className="muted text-[11px]">{r.examDate}</span>
                  <button className="btn sm ml-auto !py-0 !text-[11px]" style={{ color: '#e5484d', borderColor: '#e5484d' }} onClick={() => delRecord(r.id)}>删</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---------------- 试卷诊断 ---------------- */}
      {tab === 'diagnose' && (
        <>
          <div className="card p-4">
            <span className="text-xs font-semibold muted">录入一次考试（一科一张卷）</span>
            <p className="muted mt-1 text-[11.5px] leading-relaxed">
              逐题填得分与满分，标错因、写薄弱知识点（如「函数单调性」「电磁感应」）。提交后自动排弱知识点并推荐对应讲解视频。
              AI 拍照识别后续接入，现在手动录入，效果一样。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1"><span className="muted text-[11px]">科目</span>
                <select className="input" value={diag.subject} onChange={(e) => onDiagSubject(e.target.value)}>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">考试名</span><input className="input" value={diag.examName} onChange={(e) => setDiag((d) => ({ ...d, examName: e.target.value }))} placeholder="如 月考" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">日期</span><input className="input" type="date" value={diag.examDate} onChange={(e) => setDiag((d) => ({ ...d, examDate: e.target.value }))} /></label>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="hidden sm:grid grid-cols-[60px_1fr_1fr_70px_90px_1fr_28px] gap-2 text-[11px] muted px-1">
                <span>题号</span><span>得分</span><span>满分</span><span>对错</span><span>错因</span><span>薄弱知识点(逗号分隔)</span><span></span>
              </div>
              {diag.rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[60px_1fr_1fr_70px_90px_1fr_28px] gap-2 items-center">
                  <input className="input !py-1" value={r.qNo} onChange={(e) => setRow(i, { qNo: e.target.value })} placeholder="题号" />
                  <input className="input !py-1" type="number" value={r.score} onChange={(e) => setRow(i, { score: e.target.value })} placeholder="得分" />
                  <input className="input !py-1" type="number" value={r.fullMark} onChange={(e) => setRow(i, { fullMark: e.target.value })} placeholder="满分" />
                  <button className={`chip !py-1 !text-[11px] ${r.isCorrect ? 'chip-active' : ''}`} onClick={() => setRow(i, { isCorrect: !r.isCorrect })}>{r.isCorrect ? '对' : '错'}</button>
                  <select className="input !py-1" value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value })}>
                    {['计算', '概念', '审题', '格式', '其他'].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <input className="input !py-1" value={r.kps} onChange={(e) => setRow(i, { kps: e.target.value })} placeholder="如 函数单调性" />
                  <button className="btn sm !py-1" style={{ color: '#e5484d', borderColor: '#e5484d' }} onClick={() => delDiagRow(i)}>×</button>
                </div>
              ))}
              <button className="btn sm mt-1" onClick={addDiagRow}>+ 再加一题</button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button className="btn primary" disabled={diagSaving} onClick={submitDiag}>{diagSaving ? '分析中…' : '提交并分析'}</button>
              {diagErr && <span className="text-[12px]" style={{ color: '#e5484d' }}>{diagErr}</span>}
            </div>
          </div>

          <div className="card p-4">
            <span className="text-xs font-semibold muted">弱知识点排行（按错频 + 失分加权）</span>
            {weakKP.length ? (
              <div className="mt-3 grid gap-3">
                {weakKP.map((w) => {
                  const rec = recommendForKP(w.kp, w.subject);
                  return (
                    <div key={w.kp} className="rounded-lg p-3" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{w.kp}</span>
                        <span className="muted text-[11px]">{w.subject} · 错 {w.wrong} 次 · 累计失分 {w.lost}</span>
                      </div>
                      {rec.items.length > 0 ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {rec.items.map((r) => <ResourceCard key={r.id} r={r} weak />)}
                        </div>
                      ) : (
                        <a className="btn sm mt-2 inline-flex" href={rec.searchUrl} target="_blank" rel="noopener noreferrer">去 B 站搜「{w.subject} {w.kp} 知识点讲解」↗</a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted mt-2 text-xs">还没有诊断数据。在上面录一次考试，这里会自动排出最该补的知识点并推课。</p>
            )}
          </div>

          {weakSubj.length > 0 && (
            <div className="card p-4">
              <span className="text-xs font-semibold muted">失分率最高的科目</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {weakSubj.slice(0, 5).map((s) => (
                  <span key={s.subject} className="chip !text-[11px]" style={{ color: '#e5484d', borderColor: '#e5484d' }}>{s.subject} 失分率 {s.lostRate}%</span>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <span className="text-xs font-semibold muted">历史试卷（{papers.length}）</span>
            {!papers.length && <p className="muted mt-2 text-xs">还没有试卷记录。</p>}
            <div className="grid gap-1.5 mt-2">
              {papers.map((p) => {
                const pc = points.filter((x) => x.paperId === p.id).length;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                    <span className="font-semibold">{p.subject}</span>
                    <span className="muted">{p.examName || '测验'}</span>
                    <span className="muted text-[11px]">{p.examDate} · {pc} 题</span>
                    <button className="btn sm ml-auto !py-0 !text-[11px]" style={{ color: '#e5484d', borderColor: '#e5484d' }} onClick={() => delPaper(p.id)}>删</button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ---------------- 错题本 ---------------- */}
      {tab === 'wq' && (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">录入一道错题（三栏法）</span>
              <span className="chip !py-0.5 !text-[11px]" style={{ color: '#e5484d', borderColor: '#e5484d' }}>今日待复习 {wqDue.length}</span>
            </div>
            <p className="muted mt-1 text-[11.5px] leading-relaxed">
              拍下或抄录错题：写清「我的错解」和「正确解法」，再写一句反思、标好知识点。提交后按 1-2-4-7-15 天间隔复习，到日子会自动提醒——这是把分真正捡回来最快的一环。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1"><span className="muted text-[11px]">科目</span>
                <select className="input" value={wqForm.subject} onChange={(e) => setWQForm((f) => ({ ...f, subject: e.target.value }))}>
                  <option value="" disabled>选择科目</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">知识点(逗号分隔)</span><input className="input" value={wqForm.kps} onChange={(e) => setWQForm((f) => ({ ...f, kps: e.target.value }))} placeholder="如 函数值域" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">错因</span>
                <select className="input" value={wqForm.reason} onChange={(e) => setWQForm((f) => ({ ...f, reason: e.target.value }))}>
                  {['计算', '概念', '审题', '格式', '其他'].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <div className="grid gap-1"><span className="muted text-[11px]">难度</span>
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (<button key={n} className={`chip !text-[11px] ${wqForm.difficulty === n ? 'chip-active' : ''}`} onClick={() => setWQForm((f) => ({ ...f, difficulty: n }))}>{n}</button>))}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <label className="grid gap-1"><span className="muted text-[11px]">错题 / 我的做法</span><textarea className="input" rows={3} value={wqForm.question} onChange={(e) => setWQForm((f) => ({ ...f, question: e.target.value }))} placeholder="题干或我的错误解法" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">正确解法</span><textarea className="input" rows={3} value={wqForm.correctAnswer} onChange={(e) => setWQForm((f) => ({ ...f, correctAnswer: e.target.value }))} placeholder="标准答案与思路" /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">反思（为什么错）</span><textarea className="input" rows={3} value={wqForm.reflection} onChange={(e) => setWQForm((f) => ({ ...f, reflection: e.target.value }))} placeholder="错在哪、下次怎么避" /></label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn primary" disabled={wqSaving} onClick={submitWQ}>{wqSaving ? '保存中…' : '加入错题本'}</button>
              {wqErr && <span className="text-[12px]" style={{ color: '#e5484d' }}>{wqErr}</span>}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold muted">错题本（{wqList.length}）</span>
              <div className="flex flex-wrap gap-1">
                <button className={`chip !text-[11px] ${wqSubject === '' ? 'chip-active' : ''}`} onClick={() => setWQSubject('')}>全部</button>
                {subjects.map((s) => (<button key={s} className={`chip !text-[11px] ${wqSubject === s ? 'chip-active' : ''}`} onClick={() => setWQSubject(s)}>{s}</button>))}
              </div>
            </div>
            {!wqList.length && <p className="muted mt-2 text-xs">还没有错题。把每次错的代表题记下来，按间隔复习，这是提分最快的一环。</p>}
            <div className="mt-3 grid gap-3">
              {wqList.filter((w) => !wqSubject || w.subject === wqSubject).map((w) => {
                const due = w.nextReviewAt && w.nextReviewAt <= todayStr();
                const open = wqOpen === w.id;
                return (
                  <div key={w.id} className="rounded-lg p-3" style={{ background: 'var(--chip-bg,#f6f7f9)', borderLeft: due ? '3px solid #e5484d' : '3px solid transparent' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{w.subject}</span>
                      {w.knowledgePoints.map((k) => (
                        <a key={k} className="chip !py-0 !text-[10.5px]" href={wqKPSearch(w.subject, k)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{k} ↗</a>
                      ))}
                      <span className="chip !py-0 !text-[10.5px]">{w.reason}</span>
                      <span className="muted text-[11px]">难度 {'★'.repeat(w.difficulty)}</span>
                      {due && <span className="chip !py-0 !text-[10.5px]" style={{ color: '#e5484d', borderColor: '#e5484d' }}>待复习</span>}
                      <span className="muted ml-auto text-[11px]">已复习 {w.reviewCount} 次</span>
                      <button className="btn sm !py-0 !text-[11px]" onClick={() => setWQOpen(open ? null : w.id)}>{open ? '收起' : '详情'}</button>
                    </div>
                    {open && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-3 text-[12.5px] leading-relaxed">
                        <div><div className="muted text-[11px] mb-1">❌ 我的错解</div><div style={{ whiteSpace: 'pre-wrap' }}>{w.question || w.myAnswer || '—'}</div></div>
                        <div><div className="muted text-[11px] mb-1">✅ 正确解法</div><div style={{ whiteSpace: 'pre-wrap' }}>{w.correctAnswer || '—'}</div></div>
                        <div><div className="muted text-[11px] mb-1">💡 反思</div><div style={{ whiteSpace: 'pre-wrap' }}>{w.reflection || '—'}</div></div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button className="btn sm primary !py-0.5 !text-[11px]" disabled={wqSaving} onClick={() => reviewWQ(w.id)}>标记已复习</button>
                      <span className="muted text-[11px]">下次复习 {w.nextReviewAt || '—'}</span>
                      <button className="btn sm !py-0 !text-[11px] ml-auto" style={{ color: '#e5484d', borderColor: '#e5484d' }} onClick={() => delWQ(w.id)}>删除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ---------------- 课程导航 ---------------- */}
      {tab === 'courses' && (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold muted">年级</span>
              {GRADES.map((g) => (
                <button key={g} className={`chip !text-[11px] ${activeGrade === g ? 'chip-active' : ''}`} onClick={() => setGradePick(g)}>
                  {g}{g === myGrade && !gradePick ? '（当前）' : ''}
                </button>
              ))}
              <span className="ml-auto text-[11px] muted">共 {filteredResources.length} 个入口</span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="grid gap-1"><span className="muted text-[11px]">学科</span>
                <select className="input" value={subjectPick} onChange={(e) => setSubjectPick(e.target.value)}>
                  <option value="">全部学科</option>
                  {resSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">类型</span>
                <select className="input" value={typePick} onChange={(e) => setTypePick(e.target.value)}>
                  <option value="">全部类型</option>
                  {resTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">搜索</span>
                <input className="input" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="如 导数、遗传、作文" />
              </label>
            </div>

            {weakList.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: 'var(--chip-bg,#f6f7f9)' }}>
                <span className="muted">根据你的成绩，最容易提分的是：</span>
                {weakList.map((w) => (
                  <button key={w.subject} className={`chip !py-0 !text-[11px] ${subjectPick === w.subject ? 'chip-active' : ''}`} onClick={() => setSubjectPick(w.subject)}>
                    {w.subject} 差 {w.gap}
                  </button>
                ))}
              </div>
            )}
          </div>

          {resErr && <div className="card p-4 text-[12px]" style={{ color: '#e5484d' }}>课程库加载失败：{resErr}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredResources.map((r) => (
              <ResourceCard key={r.id} r={r} weak={!subjectPick && weakTop.some((s) => r.subjects.includes(s))} />
            ))}
          </div>
          {!filteredResources.length && !resErr && (
            <div className="card p-6 muted text-sm">这个组合下还没有资源，换个年级或类型看看。</div>
          )}

          <p className="muted px-1 text-[11px] leading-relaxed">
            说明：以上均为官方站点或 B 站搜索入口，本工具不存放、不镜像任何视频，点击后在新窗口打开。
            课程会持续补充；发现链接失效或想加某个专题，跟家里人说一声就行。
          </p>
        </>
      )}

      {/* ---------------- 学习方法 ---------------- */}
      {tab === 'methods' && (
        <>
          <div className="card p-4">
            <span className="text-xs font-semibold muted">学习方法库</span>
            <p className="muted mt-1 text-[11.5px] leading-relaxed">
              成绩上不去，多数不是不努力，是方法不对。下面每一套都能今天就开始做，点开看具体步骤。
            </p>
          </div>
          <div className="grid gap-3">
            {methods.map((m, i) => {
              const open = openMethod === m.id;
              return (
                <div key={m.id} className="card p-4">
                  <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpenMethod(open ? null : m.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold" style={{ color: 'inherit' }}>{m.name}</span>
                      <span className="muted block text-[11px]">适用：{m.scene}</span>
                    </span>
                    <span className="muted ml-auto text-[12px]">{open ? '收起' : '展开'}</span>
                  </button>
                  {open && (
                    <div className="mt-3 grid gap-2">
                      <ol className="grid gap-1.5 pl-1">
                        {m.steps.map((s, k) => (
                          <li key={k} className="flex gap-2 text-[12.5px] leading-relaxed">
                            <span className="muted shrink-0">{k + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                      {m.tip && (
                        <p className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed" style={{ background: 'var(--chip-bg,#f6f7f9)', color: 'var(--accent)' }}>
                          {m.tip}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!methods.length && <div className="card p-6 muted text-sm">方法库加载中或为空。</div>}
          </div>
        </>
      )}

      {tab === 'settings' && (
        <>
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold muted">学习档案</span>
              <button className="btn sm primary" disabled={pSaving} onClick={saveProfile}>{pSaving ? '保存中…' : '保存档案'}</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1"><span className="muted text-[11px]">称呼</span><input className="input" value={pDraft.name} onChange={(e) => setPDraft((d) => ({ ...d!, name: e.target.value }))} /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">年级</span>
                <select className="input" value={GRADES.includes(pDraft.grade) ? pDraft.grade : '高一'} onChange={(e) => setPDraft((d) => ({ ...d!, grade: e.target.value }))}>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">省市县</span>
                <div className="flex gap-1"><input className="input" value={pDraft.province} onChange={(e) => setPDraft((d) => ({ ...d!, province: e.target.value }))} /><input className="input" value={pDraft.city} onChange={(e) => setPDraft((d) => ({ ...d!, city: e.target.value }))} /><input className="input" value={pDraft.county} onChange={(e) => setPDraft((d) => ({ ...d!, county: e.target.value }))} /></div>
              </label>
              <label className="grid gap-1"><span className="muted text-[11px]">目标校</span><input className="input" value={pDraft.targetSchool} onChange={(e) => setPDraft((d) => ({ ...d!, targetSchool: e.target.value }))} /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">目标专业</span><input className="input" value={pDraft.targetMajor} onChange={(e) => setPDraft((d) => ({ ...d!, targetMajor: e.target.value }))} /></label>
              <label className="grid gap-1"><span className="muted text-[11px]">高考日期</span><input className="input" type="date" value={pDraft.gaokaoDate} onChange={(e) => setPDraft((d) => ({ ...d!, gaokaoDate: e.target.value }))} /></label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1"><span className="muted text-[11px]">首选科目（3+1+2 的「1」）</span>
                <div className="flex gap-1">{TRACKS.map((t) => (<button key={t} className={`chip !text-[11px] ${pDraft.track === t ? 'chip-active' : ''}`} onClick={() => setPDraft((d) => ({ ...d!, track: t }))}>{t}</button>))}</div>
              </div>
              <div className="grid gap-1"><span className="muted text-[11px]">再选科目（4 选 2）</span>
                <div className="flex flex-wrap gap-1">{ALL_ELECTIVES.map((s) => (<button key={s} className={`chip !text-[11px] ${pDraft.electives.includes(s) ? 'chip-active' : ''}`} onClick={() => toggleElective(s)}>{s}</button>))}</div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold muted">目标拆解（清北总分 → 每科分数）</span>
              <button className="btn sm primary" disabled={tSaving} onClick={saveTarget}>{tSaving ? '保存中…' : '保存目标'}</button>
            </div>
            <label className="grid gap-1" style={{ maxWidth: 200 }}>
              <span className="muted text-[11px]">清北目标总分</span>
              <input className="input" type="number" value={tDraft.totalTarget} onChange={(e) => setTDraft((d) => ({ ...d!, totalTarget: Number(e.target.value) || 0 }))} />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <label key={s} className="grid gap-1"><span className="muted text-[11px]">{s}（满分 {fullOf(s)}）</span>
                  <input className="input" type="number" value={tDraft.perSubject[s] ?? 0} onChange={(e) => setTDraft((d) => ({ ...d!, perSubject: { ...d!.perSubject, [s]: Number(e.target.value) || 0 } }))} />
                </label>
              ))}
            </div>
            <p className="muted mt-3 text-[11px]">提示：各科目标之和建议接近「清北目标总分」。年级改动后，课程导航会默认按新年级出内容。</p>
          </div>
        </>
      )}
    </div>
  );
}

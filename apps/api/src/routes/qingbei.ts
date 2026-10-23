import { Router } from 'express';
import { query, queryOne, execute } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { readJson, uid } from '../store.js';

/**
 * 清北成长助手后端：学习档案(profile) + 目标拆解(target) + 月考记录(records)。
 * 单用户（妹妹）模型，数据归属固定 OWNER='sister'，任意已登录用户（brother/sister）可读写，
 * 这样 brother 在电脑上、sister 在手机上都能进同一份数据，实现多端同步与远程查看。
 * 所有写操作走 execute() 服务端预处理（参数化），JSON 列以字符串写入、读出自动解析。
 */
export const qingbeiRouter = Router();

const OWNER = 'sister';

const DEFAULT_PROFILE = {
  id: OWNER,
  name: '妹妹',
  grade: '高一',
  province: '河北',
  city: '廊坊',
  county: '固安',
  targetSchool: '清华大学',
  targetMajor: '计算机类',
  track: '物理' as const,
  electives: ['化学', '生物'],
  examMode: '3+1+2',
  gaokaoDate: '2029-06-08',
};

const DEFAULT_TARGET = {
  profileId: OWNER,
  totalTarget: 690,
  perSubject: { 语文: 130, 数学: 140, 英语: 140, 物理: 95, 化学: 95, 生物: 90 },
  reference: {
    school: '清华/北大（河北·物理类）',
    years: [
      { year: 2024, score: 685, rank: 30 },
      { year: 2023, score: 687, rank: 32 },
      { year: 2022, score: 682, rank: 34 },
    ],
    note: '示例值，请以河北省教育考试院公布为准',
  },
};

interface ProfileRow {
  id: string; name: string; grade: string; province: string; city: string; county: string;
  target_school: string; target_major: string; track: '物理' | '历史';
  electives: string[]; exam_mode: string; gaokao_date: string; updated_at: Date;
}
interface TargetRow {
  profile_id: string; total_target: number; per_subject: Record<string, number>;
  reference: { school: string; years: { year: number; score: number; rank: number }[]; note?: string }; updated_at: Date;
}
interface RecordRow {
  id: string; profile_id: string; subject: string; score: number; full_mark: number;
  exam_name: string; exam_date: string; created_at: Date;
}

// MySQL DATE 列经 mysql2 会序列化为 UTC 时间字符串，直接喂给 <input type="date"> 会差一天，
// 这里统一转回本地 YYYY-MM-DD，避免前后端时区错位。
function toLocalDate(d: unknown): string {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = new Date(d as string | number | Date);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const mapProfile = (r: ProfileRow) => ({
  id: r.id, name: r.name, grade: r.grade, province: r.province, city: r.city, county: r.county,
  targetSchool: r.target_school, targetMajor: r.target_major, track: r.track,
  electives: Array.isArray(r.electives) ? r.electives : [], examMode: r.exam_mode, gaokaoDate: toLocalDate(r.gaokao_date),
});
const mapTarget = (r: TargetRow) => ({
  profileId: r.profile_id, totalTarget: r.total_target, perSubject: r.per_subject || {}, reference: r.reference || DEFAULT_TARGET.reference,
});
const mapRecord = (r: RecordRow) => ({
  id: r.id, subject: r.subject, score: Number(r.score), fullMark: Number(r.full_mark),
  examName: r.exam_name, examDate: toLocalDate(r.exam_date), createdAt: r.created_at?.toISOString?.() || String(r.created_at),
});

async function getProfile() {
  const row = await queryOne<ProfileRow>('SELECT * FROM qingbei_profile WHERE id=?', [OWNER]);
  return row ? mapProfile(row) : DEFAULT_PROFILE;
}
async function getTarget() {
  const row = await queryOne<TargetRow>('SELECT * FROM qingbei_target WHERE profile_id=?', [OWNER]);
  return row ? mapTarget(row) : DEFAULT_TARGET;
}

/* ---------------- 聚合读取 ---------------- */
qingbeiRouter.get('/', requireAuth('user'), async (_req, res) => {
  const [profile, target, rows] = await Promise.all([
    getProfile(),
    getTarget(),
    query<RecordRow>('SELECT * FROM qingbei_records WHERE profile_id=? ORDER BY exam_date DESC, created_at DESC', [OWNER]),
  ]);
  res.json({ profile, target, records: rows.map(mapRecord) });
});

/* ---------------- 课程导航库（JSON 文件驱动，改完即生效，无需重启） ---------------- */
interface ResourceItem {
  id: string; title: string; provider: string;
  kind: 'site' | 'search'; url?: string; keyword?: string;
  grades: string[]; subjects: string[]; type: string; desc?: string; top?: number;
}
interface MethodItem { id: string; name: string; scene: string; steps: string[]; tip?: string }
interface ResourceBundle { version?: number; updatedAt?: string; note?: string; items: ResourceItem[]; methods: MethodItem[] }

qingbeiRouter.get('/resources', requireAuth('user'), (_req, res) => {
  const data = readJson<ResourceBundle>('qingbei-resources.json', { items: [], methods: [] });
  res.json({
    version: data.version || 1,
    updatedAt: data.updatedAt || '',
    note: data.note || '',
    items: Array.isArray(data.items) ? data.items : [],
    methods: Array.isArray(data.methods) ? data.methods : [],
  });
});

qingbeiRouter.get('/records', requireAuth('user'), async (req, res) => {
  const params: unknown[] = [OWNER];
  let sql = 'SELECT * FROM qingbei_records WHERE profile_id=?';
  const subject = String(req.query.subject || '');
  if (subject) { sql += ' AND subject=?'; params.push(subject); }
  sql += ' ORDER BY exam_date DESC, created_at DESC';
  const rows = await query<RecordRow>(sql, params);
  res.json({ items: rows.map(mapRecord), total: rows.length });
});

/* ---------------- 档案设置 ---------------- */
qingbeiRouter.put('/profile', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim().slice(0, 40) || '妹妹';
  const grade = String(b.grade ?? '高一').slice(0, 20);
  const province = String(b.province ?? '河北').slice(0, 20);
  const city = String(b.city ?? '廊坊').slice(0, 20);
  const county = String(b.county ?? '固安').slice(0, 20);
  const targetSchool = String(b.targetSchool ?? '清华大学').slice(0, 60);
  const targetMajor = String(b.targetMajor ?? '').slice(0, 60);
  const track = b.track === '历史' ? '历史' : '物理';
  const electives = Array.isArray(b.electives)
    ? b.electives.map(String).filter(Boolean).slice(0, 4)
    : b.electives ? [String(b.electives)] : [];
  const examMode = String(b.examMode ?? '3+1+2').slice(0, 20);
  const gaokaoDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.gaokaoDate)) ? String(b.gaokaoDate) : '2029-06-08';
  await execute(
    `INSERT INTO qingbei_profile (id,name,grade,province,city,county,target_school,target_major,track,electives,exam_mode,gaokao_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),grade=VALUES(grade),province=VALUES(province),city=VALUES(city),county=VALUES(county),
       target_school=VALUES(target_school),target_major=VALUES(target_major),track=VALUES(track),
       electives=VALUES(electives),exam_mode=VALUES(exam_mode),gaokao_date=VALUES(gaokao_date)`,
    [OWNER, name, grade, province, city, county, targetSchool, targetMajor, track, JSON.stringify(electives), examMode, gaokaoDate],
  );
  res.json(await getProfile());
});

/* ---------------- 目标拆解 ---------------- */
qingbeiRouter.put('/target', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const totalTarget = Math.min(900, Math.max(0, Math.round(Number(b.totalTarget) || 0))) || DEFAULT_TARGET.totalTarget;
  const perSubject = b.perSubject && typeof b.perSubject === 'object' ? b.perSubject : DEFAULT_TARGET.perSubject;
  const reference = b.reference && typeof b.reference === 'object' ? b.reference : DEFAULT_TARGET.reference;
  await execute(
    `INSERT INTO qingbei_target (profile_id,total_target,per_subject,reference)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE total_target=VALUES(total_target),per_subject=VALUES(per_subject),reference=VALUES(reference)`,
    [OWNER, totalTarget, JSON.stringify(perSubject), JSON.stringify(reference)],
  );
  res.json(await getTarget());
});

/* ---------------- 月考记录 CRUD ---------------- */
function parseRecordBody(b: Record<string, unknown>) {
  const subject = String(b.subject ?? '').trim().slice(0, 20);
  const score = Number(b.score);
  const fullMark = Number(b.fullMark ?? b.full_mark);
  const examName = String(b.examName ?? b.exam_name ?? '').slice(0, 60);
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.examDate ?? b.exam_date))
    ? String(b.examDate ?? b.exam_date)
    : new Date().toISOString().slice(0, 10);
  return { subject, score, fullMark, examName, examDate };
}

qingbeiRouter.post('/records', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const { subject, score, fullMark, examName, examDate } = parseRecordBody(b);
  if (!subject) return res.status(400).json({ error: '科目必填' });
  if (!Number.isFinite(score) || score < 0 || score > 9999) return res.status(400).json({ error: '分数不合法（0 ~ 9999）' });
  if (!Number.isFinite(fullMark) || fullMark <= 0 || fullMark > 999) return res.status(400).json({ error: '满分不合法（1 ~ 999）' });
  const id = uid('qb_');
  await execute(
    'INSERT INTO qingbei_records (id,profile_id,subject,score,full_mark,exam_name,exam_date) VALUES (?,?,?,?,?,?,?)',
    [id, OWNER, subject, Math.round(score * 100) / 100, Math.round(fullMark * 100) / 100, examName, examDate],
  );
  const row = await queryOne<RecordRow>('SELECT * FROM qingbei_records WHERE id=?', [id]);
  res.status(201).json(row ? mapRecord(row) : null);
});

qingbeiRouter.patch('/records/:id', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const cur = await queryOne<RecordRow>('SELECT * FROM qingbei_records WHERE id=? AND profile_id=?', [req.params.id, OWNER]);
  if (!cur) return res.status(404).json({ error: '记录不存在' });
  const next = { ...parseRecordBody({ subject: cur.subject, score: cur.score, fullMark: cur.full_mark, examName: cur.exam_name, examDate: cur.exam_date, ...b }) };
  if (!next.subject) return res.status(400).json({ error: '科目不能为空' });
  if (!Number.isFinite(next.score) || next.score < 0 || next.score > 9999) return res.status(400).json({ error: '分数不合法（0 ~ 9999）' });
  if (!Number.isFinite(next.fullMark) || next.fullMark <= 0 || next.fullMark > 999) return res.status(400).json({ error: '满分不合法（1 ~ 999）' });
  await execute(
    'UPDATE qingbei_records SET subject=?,score=?,full_mark=?,exam_name=?,exam_date=? WHERE id=? AND profile_id=?',
    [next.subject, Math.round(next.score * 100) / 100, Math.round(next.fullMark * 100) / 100, next.examName, next.examDate, req.params.id, OWNER],
  );
  const row = await queryOne<RecordRow>('SELECT * FROM qingbei_records WHERE id=? AND profile_id=?', [req.params.id, OWNER]);
  res.json(row ? mapRecord(row) : null);
});

qingbeiRouter.delete('/records/:id', requireAuth('user'), async (req, res) => {
  await execute('DELETE FROM qingbei_records WHERE id=? AND profile_id=?', [req.params.id, OWNER]);
  res.json({ ok: true });
});

/* ---------------- 试卷诊断（失分点分析） ---------------- */
interface PaperRow { id: string; owner: string; subject: string; exam_name: string; exam_date: string | null; created_at: Date }
interface PointRow { id: string; paper_id: string; owner: string; subject: string; q_no: string; score: number; full_mark: number; is_correct: number; reason: string; knowledge_points: string[] | null; created_at: Date }
interface PointInput { qNo?: string; score: number; fullMark: number; isCorrect?: boolean; reason?: string; knowledgePoints?: string[] }

const mapPaper = (r: PaperRow) => ({ id: r.id, subject: r.subject, examName: r.exam_name, examDate: toLocalDate(r.exam_date), createdAt: r.created_at?.toISOString?.() || String(r.created_at) });
const mapPoint = (r: PointRow) => ({
  id: r.id, paperId: r.paper_id, subject: r.subject, qNo: r.q_no,
  score: Number(r.score), fullMark: Number(r.full_mark), isCorrect: !!r.is_correct,
  reason: r.reason, knowledgePoints: Array.isArray(r.knowledge_points) ? r.knowledge_points : [],
  createdAt: r.created_at?.toISOString?.() || String(r.created_at),
});

const REASONS = ['计算', '概念', '审题', '格式', '其他'];

qingbeiRouter.post('/analysis', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject ?? '').trim().slice(0, 20);
  if (!subject) return res.status(400).json({ error: '科目必填' });
  const examName = String(b.examName ?? '').slice(0, 60);
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.examDate)) ? String(b.examDate) : null;
  const raw = Array.isArray(b.points) ? b.points.slice(0, 200) : [];
  if (!raw.length) return res.status(400).json({ error: '至少录入一道题' });
  let valid: { qNo: string; score: number; fullMark: number; isCorrect: boolean; reason: string; knowledgePoints: string[] }[];
  try {
    valid = raw.map((p: Record<string, unknown>) => {
      const score = Number(p.score); const fullMark = Number(p.fullMark);
      if (!Number.isFinite(score) || score < 0 || score > 9999) throw new Error('分数不合法（0 ~ 9999）');
      if (!Number.isFinite(fullMark) || fullMark <= 0 || fullMark > 999) throw new Error('满分不合法（1 ~ 999）');
      return {
        qNo: String(p.qNo ?? '').slice(0, 20),
        score: Math.round(score * 100) / 100,
        fullMark: Math.round(fullMark * 100) / 100,
        isCorrect: p.isCorrect === true || p.isCorrect === 'true' || p.isCorrect === 1,
        reason: REASONS.includes(String(p.reason)) ? String(p.reason) : '其他',
        knowledgePoints: Array.isArray(p.knowledgePoints) ? p.knowledgePoints.map(String).filter(Boolean).slice(0, 10) : [],
      };
    });
  } catch (e) { return res.status(400).json({ error: (e as Error).message }); }

  const pid = uid('qp_');
  await execute('INSERT INTO qingbei_papers (id,owner,subject,exam_name,exam_date) VALUES (?,?,?,?,?)', [pid, OWNER, subject, examName, examDate]);
  for (const v of valid) {
    await execute(
      'INSERT INTO qingbei_loss_points (id,paper_id,owner,subject,q_no,score,full_mark,is_correct,reason,knowledge_points) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [uid('ql_'), pid, OWNER, subject, v.qNo, v.score, v.fullMark, v.isCorrect ? 1 : 0, v.reason, JSON.stringify(v.knowledgePoints)],
    );
  }
  const paper = await queryOne<PaperRow>('SELECT * FROM qingbei_papers WHERE id=?', [pid]);
  const pts = await query<PointRow>('SELECT * FROM qingbei_loss_points WHERE paper_id=?', [pid]);
  res.status(201).json({ paper: paper ? mapPaper(paper) : null, points: pts.map(mapPoint) });
});

qingbeiRouter.get('/analysis', requireAuth('user'), async (_req, res) => {
  const papers = await query<PaperRow>('SELECT * FROM qingbei_papers WHERE owner=? ORDER BY created_at DESC', [OWNER]);
  const pts = await query<PointRow>('SELECT * FROM qingbei_loss_points WHERE owner=? ORDER BY created_at DESC', [OWNER]);
  const bySubj = new Map<string, { lost: number; full: number; wrong: number; total: number }>();
  const byKP = new Map<string, { lost: number; wrong: number; count: number; subjects: Set<string> }>();
  for (const p of pts) {
    const lost = Number(p.full_mark) - Number(p.score);
    const s = bySubj.get(p.subject) || { lost: 0, full: 0, wrong: 0, total: 0 };
    s.lost += lost; s.full += Number(p.full_mark); s.total += 1; if (!p.is_correct) s.wrong += 1;
    bySubj.set(p.subject, s);
    const kps = Array.isArray(p.knowledge_points) ? p.knowledge_points : [];
    for (const kp of kps) {
      const k = byKP.get(kp) || { lost: 0, wrong: 0, count: 0, subjects: new Set<string>() };
      k.lost += lost; k.wrong += 1; k.count += 1; k.subjects.add(p.subject);
      byKP.set(kp, k);
    }
  }
  const weaknessBySubject = [...bySubj.entries()]
    .map(([subject, v]) => ({ subject, lostRate: v.full > 0 ? Math.round((v.lost / v.full) * 1000) / 10 : 0, lost: Math.round(v.lost * 10) / 10, wrong: v.wrong, total: v.total }))
    .sort((a, b) => b.lostRate - a.lostRate);
  const weaknessByKP = [...byKP.entries()]
    .map(([kp, v]) => ({ kp, subject: [...v.subjects][0] || '', lost: Math.round(v.lost * 10) / 10, wrong: v.wrong, count: v.count, weight: v.wrong * 2 + (v.lost > 0 ? 1 : 0) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);
  res.json({ papers: papers.map(mapPaper), points: pts.map(mapPoint), weaknessBySubject, weaknessByKP });
});

qingbeiRouter.delete('/papers/:id', requireAuth('user'), async (req, res) => {
  await execute('DELETE FROM qingbei_loss_points WHERE paper_id=? AND owner=?', [req.params.id, OWNER]);
  await execute('DELETE FROM qingbei_papers WHERE id=? AND owner=?', [req.params.id, OWNER]);
  res.json({ ok: true });
});

/* ---------------- 错题本（三栏法 + 间隔复习） ---------------- */
interface WQRow {
  id: string; owner: string; subject: string;
  knowledge_points: string[] | null; question: string | null; my_answer: string | null;
  correct_answer: string | null; reason: string | null; reflection: string | null;
  difficulty: number; review_count: number; next_review_at: string | null; created_at: Date;
}

// 间隔重复：新题 1 天后、之后 2/4/7/15/30 天滚动复习，越熟间隔越长
const SPACED = [1, 2, 4, 7, 15, 30];
function nextReview(base: Date, count: number): string {
  const gap = SPACED[Math.min(Math.max(0, count), SPACED.length - 1)];
  return toLocalDate(new Date(base.getTime() + gap * 86400000));
}

const mapWQ = (r: WQRow) => ({
  id: r.id, subject: r.subject,
  knowledgePoints: Array.isArray(r.knowledge_points) ? r.knowledge_points : [],
  question: r.question || '', myAnswer: r.my_answer || '', correctAnswer: r.correct_answer || '',
  reason: r.reason || '其他', reflection: r.reflection || '',
  difficulty: Number(r.difficulty) || 3, reviewCount: Number(r.review_count) || 0,
  nextReviewAt: toLocalDate(r.next_review_at),
  createdAt: r.created_at?.toISOString?.() || String(r.created_at),
});

qingbeiRouter.post('/wrong-questions', requireAuth('user'), async (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject ?? '').trim().slice(0, 20);
  if (!subject) return res.status(400).json({ error: '科目必填' });
  const question = String(b.question ?? '').slice(0, 4000);
  const myAnswer = String(b.myAnswer ?? '').slice(0, 4000);
  const correctAnswer = String(b.correctAnswer ?? '').slice(0, 4000);
  if (!question && !myAnswer && !correctAnswer) return res.status(400).json({ error: '请至少填「错题/我的做法」「正确解法」之一' });
  const reason = REASONS.includes(String(b.reason)) ? String(b.reason) : '其他';
  const reflection = String(b.reflection ?? '').slice(0, 4000);
  const difficulty = Math.min(5, Math.max(1, Math.round(Number(b.difficulty)) || 3));
  const knowledgePoints = Array.isArray(b.knowledgePoints) ? b.knowledgePoints.map(String).filter(Boolean).slice(0, 12) : [];
  const id = uid('wq_');
  await execute(
    'INSERT INTO qingbei_wrong_questions (id,owner,subject,knowledge_points,question,my_answer,correct_answer,reason,reflection,difficulty,review_count,next_review_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)',
    [id, OWNER, subject, JSON.stringify(knowledgePoints), question, myAnswer, correctAnswer, reason, reflection, difficulty, nextReview(new Date(), 0)],
  );
  const row = await queryOne<WQRow>('SELECT * FROM qingbei_wrong_questions WHERE id=?', [id]);
  res.status(201).json(row ? mapWQ(row) : null);
});

qingbeiRouter.get('/wrong-questions', requireAuth('user'), async (req, res) => {
  const params: unknown[] = [OWNER];
  let sql = 'SELECT * FROM qingbei_wrong_questions WHERE owner=?';
  const subject = String(req.query.subject || '');
  if (subject) { sql += ' AND subject=?'; params.push(subject); }
  sql += ' ORDER BY created_at DESC';
  const rows = await query<WQRow>(sql, params);
  res.json({ items: rows.map(mapWQ), total: rows.length });
});

qingbeiRouter.patch('/wrong-questions/:id', requireAuth('user'), async (req, res) => {
  const cur = await queryOne<WQRow>('SELECT * FROM qingbei_wrong_questions WHERE id=? AND owner=?', [req.params.id, OWNER]);
  if (!cur) return res.status(404).json({ error: '错题不存在' });
  const b = req.body || {};
  if (b.review === true) {
    const newCount = Number(cur.review_count || 0) + 1;
    await execute('UPDATE qingbei_wrong_questions SET review_count=?, next_review_at=? WHERE id=? AND owner=?', [newCount, nextReview(new Date(), newCount), req.params.id, OWNER]);
  } else {
    const subject = b.subject !== undefined ? String(b.subject).slice(0, 20) : cur.subject;
    const reason = b.reason !== undefined ? (REASONS.includes(String(b.reason)) ? String(b.reason) : '其他') : (cur.reason || '其他');
    const difficulty = b.difficulty !== undefined ? Math.min(5, Math.max(1, Math.round(Number(b.difficulty)) || 3)) : Number(cur.difficulty) || 3;
    const question = b.question !== undefined ? String(b.question).slice(0, 4000) : (cur.question || '');
    const myAnswer = b.myAnswer !== undefined ? String(b.myAnswer).slice(0, 4000) : (cur.my_answer || '');
    const correctAnswer = b.correctAnswer !== undefined ? String(b.correctAnswer).slice(0, 4000) : (cur.correct_answer || '');
    const reflection = b.reflection !== undefined ? String(b.reflection).slice(0, 4000) : (cur.reflection || '');
    const knowledgePoints = b.knowledgePoints !== undefined
      ? (Array.isArray(b.knowledgePoints) ? b.knowledgePoints.map(String).filter(Boolean).slice(0, 12) : [])
      : (Array.isArray(cur.knowledge_points) ? cur.knowledge_points : []);
    await execute(
      'UPDATE qingbei_wrong_questions SET subject=?,reason=?,difficulty=?,question=?,my_answer=?,correct_answer=?,reflection=?,knowledge_points=? WHERE id=? AND owner=?',
      [subject, reason, difficulty, question, myAnswer, correctAnswer, reflection, JSON.stringify(knowledgePoints), req.params.id, OWNER],
    );
  }
  const row = await queryOne<WQRow>('SELECT * FROM qingbei_wrong_questions WHERE id=? AND owner=?', [req.params.id, OWNER]);
  res.json(row ? mapWQ(row) : null);
});

qingbeiRouter.delete('/wrong-questions/:id', requireAuth('user'), async (req, res) => {
  await execute('DELETE FROM qingbei_wrong_questions WHERE id=? AND owner=?', [req.params.id, OWNER]);
  res.json({ ok: true });
});

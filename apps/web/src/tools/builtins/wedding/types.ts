/**
 * 婚礼礼账本前端类型与常量。
 * 注意：这些接口与 apps/api 的 WeddingData 契约保持一致（见 docs/API.md），
 * 前端刻意不 import 后端源码——前后端分离，契约即边界。
 */
export type GiftForm = 'cash' | 'wechat' | 'alipay' | 'redpacket' | 'gift';
export type GiftSide = 'groom' | 'bride' | 'both';

export interface WeddingMeta {
  groom: string;
  bride: string;
  date: string;
  venue: string;
  banquet: string;
  recorder: string;
  thanks: string;
}

export interface GiftEntry {
  id: string;
  name: string;
  /** 称谓（「二舅」「王总」），有则优先于姓名展示 */
  title?: string;
  amount: number;
  relation: string;
  side: GiftSide;
  form: GiftForm;
  /** 实物礼品明细（随礼形式为 gift 时填，如「喜被一床」） */
  gift?: string;
  partySize: number;
  recorder: string;
  date: string;
  note: string;
  createdAt: string;
}

export interface WeddingStats {
  total: number;
  count: number;
  avg: number;
  max: number;
  maxEntry: GiftEntry | null;
  bySide: { groom: number; bride: number; both: number };
  byRelation: { key: string; count: number; amount: number }[];
  byForm: { key: string; count: number; amount: number }[];
  byRecorder: { key: string; count: number; amount: number }[];
}

/* ---------------- 选项常量 ---------------- */

export const RELATIONS = ['家人', '亲戚', '朋友', '同学', '同事', '领导', '邻居', '其他'];

export const FORMS: { id: GiftForm; name: string; icon: string }[] = [
  { id: 'cash', name: '现金', icon: '💵' },
  { id: 'wechat', name: '微信', icon: '💬' },
  { id: 'alipay', name: '支付宝', icon: '🅰️' },
  { id: 'redpacket', name: '红包', icon: '🧧' },
  { id: 'gift', name: '礼物', icon: '🎁' },
];

export const SIDES: { id: GiftSide; name: string }[] = [
  { id: 'groom', name: '男方' },
  { id: 'bride', name: '女方' },
  { id: 'both', name: '共同' },
];

export const formLabel = (f: string) => FORMS.find((x) => x.id === f)?.name || f;
export const sideLabel = (s: string) => SIDES.find((x) => x.id === s)?.name || s;

/** 模拟人手写的字体（Google Fonts 中文字体 + 系统楷体兜底） */
export const HAND_FONTS = [
  { id: 'zhimang', name: '智勇行书', css: '"Zhi Mang Xing", "STKaiti", "KaiTi", cursive', note: '流畅行书，最接近账房手写' },
  { id: 'kuaile', name: '站酷快乐体', css: '"ZCOOL KuaiLe", "STKaiti", "KaiTi", cursive', note: '圆润喜庆，配红金模板' },
  { id: 'mashan', name: '马善政行楷', css: '"Ma Shan Zheng", "STKaiti", "KaiTi", cursive', note: '行楷均衡，端庄清楚' },
  { id: 'longcang', name: '龙藏体', css: '"Long Cang", "STKaiti", "KaiTi", cursive', note: '楷意收敛，长辈视角' },
  { id: 'maoshan', name: '毛草体', css: '"Liu Jian Mao Cao", "STKaiti", "KaiTi", cursive', note: '笔迹潦草，真·手写感' },
];

export const fontById = (id: string) => HAND_FONTS.find((f) => f.id === id) || HAND_FONTS[0];

/** 卡纸模板 */
export const BOOK_TEMPLATES = [
  { id: 'redgold', name: '经典红金', desc: '传统中式：红底金字、双喜压纹' },
  { id: 'plain', name: '素雅白', desc: '白底墨字、朱红点缀，打印省墨' },
  { id: 'rice', name: '墨香宣纸', desc: '米黄做旧、墨字行书，文雅稳重' },
  { id: 'west', name: '西式简约', desc: '细线框、无衬线，清爽现代' },
];

/* ---------------- 客户端统计与筛选（与服务端 /wedding/stats 同口径） ---------------- */

export function computeStats(rows: GiftEntry[]): WeddingStats {
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const bySide = { groom: 0, bride: 0, both: 0 };
  for (const e of rows) if (e.side in bySide) bySide[e.side] += Number(e.amount) || 0;
  const group = (key: (e: GiftEntry) => string) => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const e of rows) {
      const k = key(e) || '未填';
      const cur = m.get(k) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(e.amount) || 0;
      m.set(k, cur);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount);
  };
  const maxEntry = rows.length ? rows.reduce((m, e) => ((Number(e.amount) || 0) > (Number(m.amount) || 0) ? e : m)) : null;
  return {
    total,
    count: rows.length,
    avg: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    max: maxEntry ? Number(maxEntry.amount) || 0 : 0,
    maxEntry,
    bySide,
    byRelation: group((e) => e.relation),
    byForm: group((e) => e.form),
    byRecorder: group((e) => e.recorder),
  };
}

export interface LedgerFilter {
  q: string;
  relation: string;
  side: string;
  form: string;
  recorder: string;
  dateFrom: string;
  dateTo: string;
  min: string;
  max: string;
}

export const EMPTY_FILTER: LedgerFilter = { q: '', relation: '', side: '', form: '', recorder: '', dateFrom: '', dateTo: '', min: '', max: '' };

export function filterEntries(rows: GiftEntry[], f: LedgerFilter): GiftEntry[] {
  const kw = f.q.trim().toLowerCase();
  const min = f.min === '' ? null : Number(f.min);
  const max = f.max === '' ? null : Number(f.max);
  return rows.filter((e) => {
    if (kw && !`${e.name} ${e.note} ${e.relation}`.toLowerCase().includes(kw)) return false;
    if (f.relation && e.relation !== f.relation) return false;
    if (f.side && e.side !== f.side) return false;
    if (f.form && e.form !== f.form) return false;
    if (f.recorder && e.recorder !== f.recorder) return false;
    if (f.dateFrom && e.date < f.dateFrom) return false;
    if (f.dateTo && e.date > f.dateTo) return false;
    if (min !== null && Number.isFinite(min) && e.amount < min) return false;
    if (max !== null && Number.isFinite(max) && e.amount > max) return false;
    return true;
  });
}

/** 按索引生成确定性轻微抖动，模拟手写不平整 */
export function jitterFor(i: number): string {
  const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const deg = ((r < 0 ? -r : r) - 0.5) * 0.9;
  return `rotate(${deg.toFixed(2)}deg)`;
}

export const money = (n: number) => '¥' + (Number(n) || 0).toLocaleString('zh-CN');

/* ---------------- 礼簿惯例：金额大写 ---------------- */

const CN_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const CN_UNIT = ['', '拾', '佰', '仟'];
const CN_SECTION = ['', '万', '亿'];

function intToCn(n: number): string {
  if (!n) return '零';
  const s = String(n);
  const len = s.length;
  let out = '';
  let zero = false;
  for (let i = 0; i < len; i++) {
    const d = Number(s[i]);
    const pos = len - i - 1;
    if (d === 0) {
      zero = true;
    } else {
      if (zero) {
        out += '零';
        zero = false;
      }
      out += CN_NUM[d] + CN_UNIT[pos % 4];
    }
    const sec = Math.floor(pos / 4);
    if (pos % 4 === 0 && sec > 0) {
      const sectionVal = Number(s.slice(Math.max(0, len - (sec + 1) * 4), len - sec * 4));
      if (sectionVal > 0) out += CN_SECTION[sec] || '';
    }
  }
  return out;
}

/** 人民币金额转中文大写：1200 → 壹仟贰佰元整（礼簿正式写法） */
export function toChineseAmount(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (!v) return '零元整';
  const int = Math.floor(v);
  const cents = Math.round((v - int) * 100);
  const yuan = int ? intToCn(int) + '元' : '';
  if (!cents) return yuan + '整';
  const jiao = Math.floor(cents / 10);
  const fen = cents % 10;
  let tail = '';
  if (jiao) tail += CN_NUM[jiao] + '角';
  if (fen) tail += CN_NUM[fen] + '分';
  return yuan + (tail || '整');
}

/** 礼簿上的称呼：优先「称谓」，没有则回退姓名 */
export function displayName(e: GiftEntry): string {
  return e.title ? (e.name ? `${e.title} ${e.name}` : e.title) : e.name;
}

/** CSV 导出（带 BOM，Excel 直接打开不乱码） */
export function toCsv(rows: GiftEntry[]): string {
  const head = ['称谓', '姓名', '礼金', '大写', '关系', '方属', '形式', '礼品', '人数', '记账人', '日期', '备注'];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(',')].concat(
    rows.map((e) =>
      [
        e.title || '',
        e.name,
        e.amount,
        toChineseAmount(e.amount),
        e.relation,
        sideLabel(e.side),
        formLabel(e.form),
        e.gift || '',
        e.partySize,
        e.recorder,
        e.date,
        e.note,
      ]
        .map(esc)
        .join(',')
    )
  );
  return '\uFEFF' + lines.join('\r\n');
}

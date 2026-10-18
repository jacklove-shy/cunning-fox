export type PostStatus = 'draft' | 'published';

export interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  cat: string;
  tags: string[];
  status: PostStatus;
  views: number;
  pinned?: boolean;
  cover?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tool {
  id: string;
  name: string;
  slug: string;
  desc: string;
  cat: string;
  url?: string;
  repo?: string;
  /** 站内路由链接（如复盘文章）；有则优先于 url/repo 用 SPA 跳转 */
  to?: string;
  tags: string[];
  hot?: boolean;
  icon?: string;
  createdAt: string;
}

export interface Meta {
  postCats: string[];
  toolCats: string[];
  site: {
    name: string;
    tagline: string;
    desc: string;
    author: string;
    github: string;
    email: string;
  };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

// ===== 预留模块（当前静态 JSON，后期切真实服务，前端无感）=====

export interface Friend {
  id: string;
  name: string;
  url: string;
  desc: string;
  avatar?: string;
  tag?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  /** 归属文章 slug；缺省 = 留言板全局留言 */
  slug?: string;
  nick: string;
  avatar?: string;
  content: string;
  top?: boolean;
  createdAt: string;
  /** 楼中楼：父评论 id；缺省 = 一级留言/评论 */
  parentId?: string;
  /** 楼中楼：被回复者昵称（渲染成「回复 @昵称」） */
  replyTo?: string;
}

export type TimelineKind = 'project' | 'study' | 'life' | 'site';

export interface TimelineItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  desc: string;
  kind: TimelineKind;
  createdAt: string;
}

export interface ArchiveGroup {
  month: string; // YYYY-MM
  posts: Omit<Post, 'content'>[];
}

// ===== 婚礼礼账本（本地工具，静态 JSON 驱动）=====

export type GiftForm = 'cash' | 'wechat' | 'alipay' | 'redpacket' | 'gift';
export type GiftSide = 'groom' | 'bride' | 'both';

export interface WeddingMeta {
  groom: string;
  bride: string;
  /** 婚期 YYYY-MM-DD */
  date: string;
  venue: string;
  /** 宴席名，如「中式答谢宴」 */
  banquet: string;
  /** 默认记账人 */
  recorder: string;
  /** 答谢卡致谢模板，支持 {name} 占位 */
  thanks: string;
}

export interface GiftEntry {
  id: string;
  name: string;
  /** 称谓/称呼（礼簿上写的「二舅」「王总」），有则优先于姓名展示 */
  title?: string;
  amount: number;
  relation: string;
  side: GiftSide;
  form: GiftForm;
  /** 实物礼品明细（随礼形式为 gift 时填写，如「喜被一床」） */
  gift?: string;
  /** 随礼人数（一家多人按 1 笔记，人数分开算） */
  partySize: number;
  recorder: string;
  /** 随礼日期 YYYY-MM-DD */
  date: string;
  note: string;
  createdAt: string;
}

export interface WeddingData {
  meta: WeddingMeta;
  entries: GiftEntry[];
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

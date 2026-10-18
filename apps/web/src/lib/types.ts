export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cat: string;
  tags: string[];
  status: 'draft' | 'published';
  views: number;
  pinned?: boolean;
  cover?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostDetail extends Omit<PostSummary, 'wordCount'> {
  content: string;
  related?: PostSummary[];
  prev?: PostSummary | null;
  next?: PostSummary | null;
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
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

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface SiteMeta {
  site: {
    name: string;
    tagline: string;
    desc: string;
    author: string;
    github: string;
    email: string;
  };
  postCats: string[];
  toolCats: string[];
  facets: { postCats: Record<string, number>; toolCats: Record<string, number> };
}

export interface Stats {
  posts: number;
  drafts: number;
  tools: number;
  projects: number;
  views: number;
  lastUpdated: string | null;
}

// ===== 预留模块（当前静态 JSON，后期切真实服务）=====
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
  slug?: string;
  nick: string;
  avatar?: string;
  content: string;
  top?: boolean;
  createdAt: string;
  /** 楼中楼：父评论 id；缺省 = 一级 */
  parentId?: string;
  /** 楼中楼：被回复者昵称 */
  replyTo?: string;
}

export type TimelineKind = 'project' | 'study' | 'life' | 'site';

export interface TimelineItem {
  id: string;
  date: string;
  title: string;
  desc: string;
  kind: TimelineKind;
  createdAt: string;
}

export interface ArchiveGroup {
  month: string;
  posts: PostSummary[];
}

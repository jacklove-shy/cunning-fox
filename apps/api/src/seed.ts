import fs from 'node:fs';
import path from 'node:path';
import type { Comment, Friend, Meta, Post, TimelineItem, Tool } from './types.js';
import { writeJson } from './store.js';

const now = '2026-10-17T10:00:00.000Z';

export const SEED_META: Meta = {
  postCats: ['前端', '后端', 'AI', '工程化', '踩坑', '项目复盘'],
  toolCats: ['影视工具', '去水印', '浏览器插件', '小游戏', '开发工具', 'AI 工具', '学习工具'],
  site: {
    name: '一只狡猾的狐狸',
    tagline: '一个装着工具、笔记和作品的小集市',
    desc: '一只狡猾的狐狸：技术笔记、能直接用的工具、以及做过的东西。',
    author: '赵子轩',
    github: 'https://github.com/',
    email: 'hello@example.com',
  },
};

const p = (
  slug: string,
  title: string,
  summary: string,
  cat: string,
  tags: string[],
  createdAt: string,
  content: string,
  extra: Partial<Post> = {},
): Post => ({
  id: 'p_' + slug.slice(0, 12),
  slug,
  title,
  summary,
  content,
  cat,
  tags,
  status: 'published',
  views: 0,
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

export const SEED_POSTS: Post[] = [
  p(
    'job-hunter-0-to-1',
    '从 0 到 1 做一个「自动投递中台」：把招聘网站变成我的数据源',
    '一个没有框架、没有数据库、单文件 Node 服务撑起来的求职中台：抓岗位、算匹配、自动投递、看板跟踪，再挂个机器人把结果推送到手机。',
    '项目复盘',
    ['Node.js', '自动化', '求职', '项目'],
    '2026-10-12T09:00:00.000Z',
    `## 为什么要做这个东西

投递这件事最大的成本不是写简历，是**重复劳动**：翻列表、点开、对比 JD、复制粘贴打招呼、记下投了谁。

既然这些动作有固定套路，就该交给程序。目标很朴素：

- 每天早上自动扫一遍新岗位，按关键词和自研匹配度打分
- 只投我关心的方向（前端 / 全栈），不投外包和不匹配城市
- 投完落到一个看板里，谁已读、谁约面、谁挂了，一眼看到

## 架构：故意不用框架

\`\`\`
job-hunter/
├── server.js          # 单文件 HTTP 服务（Node 原生 http）
├── agent/             # 抓取与投递脚本（Playwright 驱动真实浏览器）
├── public/            # 原生 JS 前端（无构建）
└── data/              # JSON 文件即数据库
\`\`\`

不引框架的理由很实际：**这个程序要在我自己的 Windows 上常驻**，依赖越少，坏的概率越低。半年后回头看，这个决定省掉了无数次 \`node_modules\` 疑难杂症。

## 三个关键设计

**1. 抓取用真实浏览器，不用接口逆向。**  
接口会变、会加签名、会风控。用 Playwright 驱动我已经登录的 Chrome，等价于「我自己在点」，稳定性和合规边界都更清楚。

**2. 匹配度不是关键词命中数。**  
把它拆成四块加权：技术栈重合度、年限匹配、薪资区间、公司属性（自研/外包/规模）。每一条都落成可解释的理由，界面上直接显示「为什么推荐它」。

**3. 数据用 JSON，但状态机要清晰。**  
岗位的 \`progress\` 是一条单向状态链：未投递 → 已投递 → 已查看 → 笔试中 → 邀面试 → offer / 已拒绝。所有统计、看板、企业库都从这个字段派生，不做第二份真相。

## 踩过的坑

- **风控刹车**：连续投递会触发验证，脚本里必须留随机间隔和每日上限，遇到验证码直接停而不是硬刚。
- **select 的双冒泡**：\`click\` 和 \`change\` 都会触发筛选逻辑，导致一次操作请求两次，最后统一收敛到 \`change\`。
- **分页的 NaN 陷阱**：\`pageSlice(key)\` 对没注册的 key 取到 \`undefined\`，\`slice(NaN, NaN)\` 静默返回空数组——页面不报错，就是空白。现在所有页码都过一层 \`pageCur()\` 兜底。

## 它现在能做什么

- 岗位池自动刷新 + 匹配度排序 + 一键批量投递
- 会话镜像：把 BOSS 聊天记录同步进来看板和统计
- 面试题库（本地 + 牛客 461 题）、投递看板、企业库
- 通过 QQ 机器人把「今日投递数 / 面试邀约」推送到手机

这套东西的意义不在于投了多少份，而在于我把「找工作」这件被动的事，做成了一个可以观测、可以迭代的系统。`,
    { pinned: true, views: 128 },
  ),
  p(
    'nowcoder-461-questions',
    '牛客 461 道前端面试题：抓取、清洗与分类',
    '一个反直觉的发现：牛客题库的 page 参数不是列表分页，而是题号。搞清楚这一点，整站的题目加答案就能零登录抓下来。',
    '工程化',
    ['爬虫', 'Node.js', '面试题'],
    '2026-10-15T14:30:00.000Z',
    `## 先看 URL

\`\`\`
https://www.nowcoder.com/ta/review-frontend/review?query=&asc=true&order=&page=12
\`\`\`

任何人第一眼都会认为 \`page\` 是列表页码。但把 \`page=12\` 改成 \`page=13\`，你会发现**题目完全换了，而且一次只出一题**。

结论：\`page\` 就是题号，范围 1..464。

## 为什么能零登录抓

页面是 SSR 直出的：题目在 \`<title>\` 里，参考答案在 \`div.design-answer-box\` 里。用 \`curl\` 拿到的 HTML 已经包含全部正文，不需要执行 JS，也不需要 Cookie。

\`\`\`js
const html = await (await fetch(url)).text();
const title = html.match(/<title>([^<]+)<\\/title>/)?.[1];
const answer = html.match(/class="design-answer-box"[^>]*>([\\s\\S]*?)<\\/div>/)?.[1];
\`\`\`

## 抓取策略

- 串行 + 1200ms 间隔，不做并发（对站点友好，也避免被限流）
- 标题去重（题库里有重复题）
- 每抓一题就落盘，中途断掉可以 \`--keep-existing\` 续跑
- 掌握度、收藏等**个人进度单独存一个文件**，重新同步不会丢

全量跑完：**461 题，失败 0，耗时 609 秒。**

## 清洗出来的分类分布

| 分类 | 题数 |
| --- | --- |
| JavaScript | 233 |
| 网络 | 49 |
| 浏览器 | 43 |
| 手写题 | 36 |
| CSS | 31 |
| HTML | 22 |
| React | 19 |
| 性能优化 | 14 |
| 安全 / Vue / Node / 工程化 | 14 |

分类靠 12 条正则规则打标，命中不到就兜底 JavaScript——粗糙但够用，人工再修比从零标注便宜太多。

## 顺手做的事

题库不止能看。加了一个「勾选 → 转博客草稿」的按钮，把题目和答案组装成 Markdown，带上原文链接，直接进编辑器润色。**学习资料和输出内容之间不该有搬运成本。**`,
    { views: 96 },
  ),
  p(
    'pagination-is-not-slice',
    '分页这件小事：从 slice 到状态管理，中间隔着一堆坑',
    '写一个分页条只要二十行，但让七处列表共用一个分页状态、还不出现「点第二页没反应」，是另一回事。',
    '前端',
    ['分页', '状态管理', '原生JS'],
    '2026-10-16T16:00:00.000Z',
    `## 最小实现

\`\`\`js
const PAGE = { pool: 1, co: 1, q: 1 };
const pageSlice = (key, rows, size = 20) =>
  rows.slice((PAGE[key] - 1) * size, PAGE[key] * size);
\`\`\`

三行就能用。但它会在三种情况下安静地坏掉：

**1. key 没注册。** \`PAGE['bank']\` 是 \`undefined\`，\`(undefined-1)*20\` 得到 \`NaN\`，\`slice(NaN, NaN)\` 返回**空数组**——不报错，页面就白了。

**2. 数据变少，页码越界。** 筛选后只剩 3 条，你还在第 5 页，用户看到的是空白。

**3. 分页条和渲染用了不同的页码。** 一处做了钳制、一处没做，就会出现「高亮第 3 页，内容是第 1 页」。

## 修法

\`\`\`js
function pageCur(key) {
  const p = Math.floor(+PAGE[key]);
  return Number.isFinite(p) && p >= 1 ? p : 1;   // NaN / 未注册 / 负数 全部归 1
}
function pageSlice(key, rows) {
  const size = PAGE_SIZE[key] ?? 20;
  const maxPage = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(pageCur(key), maxPage);
  PAGE[key] = p;                                  // 钳制后回写，保证分页条一致
  return rows.slice((p - 1) * size, p * size);
}
\`\`\`

核心是**单一数据源**：\`slice\` 和 \`pager\` 都调 \`pageCur\`，并且都把钳制结果写回同一个状态。谁先渲染都不影响结果。

## 该在哪儿分页

不是所有列表都值得分页。判断标准只有一条：**滚动成本 > 翻页成本**。

- 岗位池 150 条、企业库、投递台账 → 分页（20/页，可切 50、100）
- 会话镜像卡片 → 分页（12/页，卡片高）
- 题库 → 10/页，因为单条内容长
- 看板视图 → **列内分页**，每列 6 张卡，用 \`‹ 2/5 ›\` 控制。整页分页对看板没意义，看板的价值就是同屏对比不同阶段

## 还有个小坑

\`<select>\` 的 \`click\` 和 \`change\` 都会冒泡。如果你在两个事件里都写了筛选逻辑，用户点一次下拉、选一次值，会触发两次请求、两次重渲染，页码还会被重置两次。**筛选统一只监听 \`change\`。**`,
    { views: 74 },
  ),
  p(
    'dark-mode-with-css-vars',
    '一套 CSS 变量撑起深浅双主题',
    '不引 UI 库、不写两套样式，只靠 8 个颜色令牌把人眼舒适度调对。',
    '前端',
    ['CSS', '主题', '设计系统'],
    '2026-10-10T11:00:00.000Z',
    `## 先把颜色收成令牌

\`\`\`css
:root {
  --bg: #0b0f17;
  --panel: #131a26;
  --panel2: #1a2331;
  --line: #253044;
  --txt: #e6edf7;
  --muted: #8b9bb4;
  --accent: #4f8cff;
  --ok: #35c48a;
}
[data-theme='light'] {
  --bg: #f6f8fc;
  --panel: #ffffff;
  --panel2: #f1f5fb;
  --line: #e3e9f2;
  --txt: #101828;
  --muted: #667085;
  --accent: #2563eb;
  --ok: #0f9d63;
}
\`\`\`

之后的样式里**只准出现 \`var(--x)\`**，一个硬编码的颜色都不留。这一步做完，双主题就完成了 90%。

## 切换的三行 JS

\`\`\`js
const apply = (t) => document.documentElement.dataset.theme = t;
apply(localStorage.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
\`\`\`

优先级：用户显式选择 > 系统偏好 > 默认深色。

## 三个容易翻车的细节

1. **首屏闪白**：主题脚本必须在 \`<head>\` 里同步执行，不能等 React 挂载。
2. **图表和 canvas**：SVG / Canvas 里的颜色不会继承 CSS 变量，要读出来再喂进去。
3. **阴影**：深色下阴影几乎不可见，要用「更亮的边框」代替投影。

## 为什么值得做

不是审美问题，是**阅读时长**问题。看板、题库、日志这些页面我会连续盯半小时以上，深色减少眼疲劳；而打印、截图、白天在窗边，浅色更清楚。两个都要，成本也就是 8 个变量。`,
    { views: 61 },
  ),
  p(
    'native-node-http-server',
    '不用 Express：用 Node 原生 http 写一个能上生产的后台服务',
    '静态托管、JSON API、路由、文件上传、超时控制、优雅退出——600 行搞定，且永远不会有依赖地狱。',
    '后端',
    ['Node.js', 'HTTP', '零依赖'],
    '2026-10-08T20:00:00.000Z',
    `## 路由就是一个 switch

\`\`\`js
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + req.headers.host);
  const pathname = u.pathname;
  if (pathname === '/api/state' && req.method === 'GET') return json(res, buildState());
  if (pathname.startsWith('/api/jobs/') && req.method === 'PATCH') return patchJob(req, res, pathname);
  return serveStatic(req, res, pathname);
});
\`\`\`

读到 600 行的时候会开始难受——那时再换框架也不迟，而且你已经知道框架替你做了什么。

## 必须自己处理的四件事

**1. 请求体上限。** 不限制大小，一个 2G 的 POST 就能把内存吃满。

\`\`\`js
let size = 0;
req.on('data', c => { size += c.length; if (size > 5e6) req.destroy(); });
\`\`\`

**2. Content-Type 白名单。** 静态服务要按扩展名给 MIME，且 \`..\` 必须过滤，否则就是目录穿越。

**3. 长任务不能在请求里同步跑。** 抓 461 道题要 10 分钟，前端等不了。做法是「请求触发 → 子进程跑 → 读日志末行 JSON 返回」，或直接改成任务表 + 轮询。

**4. 优雅退出。** \`SIGINT\` 时停止接收新连接、把内存里的待写数据刷盘，否则 JSON 数据文件可能被写坏。所以所有写入都走「临时文件 + rename」的原子写。

## 什么时候该换框架

- 需要鉴权、限流、上传、WebSocket 三件以上
- 团队超过两个人
- 需要生态中间件（session、ORM、swagger）

**单人小工具不用换。** 少一个依赖，就少一次「为什么昨天还能跑」。`,
    { views: 55 },
  ),
  p(
    'ai-fullstack-roadmap',
    'AI 全栈路线：把大模型接进日常开发流，而不是供起来',
    '不追新框架，先把四件事做扎实：能写、能调、能部署、能让 AI 替你干重复活。',
    'AI',
    ['AI', '全栈', '学习路线'],
    '2026-10-14T10:00:00.000Z',
    `## 我的路线图（按能交付的东西排，不按知识点排）

**第一层：能跑起来（1-2 个月）**
HTML/CSS/JS 扎实 → 一个不用框架的 CRUD 页面 → 用 Node 写接口 → 买台服务器挂上去。目标产物：**一个别人能访问的网址**。

**第二层：能维护（2-3 个月）**
React + TypeScript + 路由 + 状态 → 组件拆分 → 接口层封装 → 错误与加载态。目标产物：**一个前后端分离的项目，代码别人能看懂**。

**第三层：能上量（3-6 个月）**
数据库设计与索引 → 鉴权（JWT/Session）→ 缓存 → 部署与日志 → 域名、HTTPS、备案。目标产物：**一套有用户、有监控的系统**。

**第四层：AI 增强（持续）**
- 用 LLM 做**结构化抽取**：简历解析、JD 拆解、报错归因
- 用 embedding + 向量检索做**个人知识库**：把笔记、题库、文档变成可问答的索引
- 用 Agent 做**流程编排**：能自己调工具、看结果、决定下一步
- 关键认知：**AI 不是功能，是杠杆**。它放大的是你已经会的那部分工程能力

## 落地清单

| 阶段 | 交付物 | 验收标准 |
| --- | --- | --- |
| 1 | 静态站 + 一个 API | 有公网地址 |
| 2 | 前后端分离博客 | 有分类、搜索、分页、后台 |
| 3 | 带数据库的业务系统 | 能注册登录、能扛住并发 |
| 4 | AI 增强模块 | 至少一处 LLM 在替你做重复劳动 |

## 别做的事

- 别一开始就上微服务、K8s、GraphQL
- 别为了「技术栈好看」引一堆没读过的库
- 别把时间花在配置上，**配置不产生作品**

判断学习有没有效，只看一件事：**这周有没有多出一个能点开的东西。**`,
    { views: 143 },
  ),
  p(
    'chrome-extension-from-zero',
    '浏览器插件从 0 到能装进自己的 Chrome',
    'Manifest V3 的最小闭环：content script 改页面、background 做调度、popup 做交互，以及审核会卡你的那几个点。',
    '工程化',
    ['Chrome Extension', 'MV3'],
    '2026-09-28T15:00:00.000Z',
    `## 最小三件套

\`\`\`json
{
  "manifest_version": 3,
  "name": "页面小助手",
  "version": "0.0.1",
  "permissions": ["storage", "activeTab", "scripting"],
  "background": { "service_worker": "bg.js" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }],
  "action": { "default_popup": "popup.html" }
}
\`\`\`

## MV3 的三个关键差异

1. **background 是 service_worker，会随时被回收。** 不能存内存状态，一切进 \`chrome.storage\`；定时任务用 \`chrome.alarms\` 而不是 \`setInterval\`。
2. **不能远程加载代码。** 所有 JS 必须打包进包里，这条会卡掉一批「动态注入脚本」的写法。
3. **跨域请求走背景页。** content script 受页面 CSP 限制，网络请求要转到 background 里发。

## content script 与页面的隔离

两者共享 DOM，但 JS 作用域隔离。要传数据用 \`window.postMessage\`，要改页面行为就只在 DOM 层操作，**别试图改页面自己的 JS 变量**。

## 发布前自查

- 权限只要必要的（\`<all_urls>\` 会被重点审）
- 隐私政策、用途说明写清楚
- 图标 16/48/128 三档齐全
- 首次提交审核通常 1-3 个工作日

自己用的话，开发者模式「加载已解压的扩展程序」就够了，不必上架。**先满足自己，再考虑分发。**`,
    { views: 48 },
  ),
  p(
    'watermark-removal-boundary',
    '去水印工具：技术原理与合理边界',
    '图像修复、频域滤波、视频逐帧处理——技术上能做，但有些事不该做。',
    'AI',
    ['图像处理', '工具', '合规'],
    '2026-10-05T13:00:00.000Z',
    `## 三种技术路线

**1. 已知位置 → 内容感知填充。**  
水印位置固定时，把它当 mask，用周围像素做 inpainting（传统 PatchMatch，或 LaMa 这类模型）。效果好、速度快。

**2. 半透明水印 → 频域处理。**  
周期性水印在频域有峰值，做陷波滤波可以压制。副作用是纹理细节一起糊。

**3. 视频 → 逐帧 + 时序一致性。**  
逐帧处理会闪烁，需要用光流把相邻帧的修复结果对齐再融合。

## 边界

这些能力只应该用在：

- **自己拥有版权**的素材
- 公开授权、但平台自动加了水印的素材
- 学术研究、算法演示

**不应该**用于去除他人作品的权利标识后二次传播——那不是技术问题，是法律问题。

## 如果要做成工具

放在自己站上，我会：

1. 首屏写清楚用途限制，不做「一键去全网水印」的暗示
2. 本地处理优先（浏览器端 WASM / Canvas），图片不上传服务器
3. 保留原始文件下载，不做隐式压缩

**技术能力越强，越要主动画边界。** 这句话在 AI 时代尤其成立。`,
    { views: 39 },
  ),
];

const t = (
  slug: string,
  name: string,
  desc: string,
  cat: string,
  tags: string[],
  extra: Partial<Tool> = {},
): Tool => ({
  id: 't_' + slug.slice(0, 12),
  slug,
  name,
  desc,
  cat,
  tags,
  createdAt: '2026-09-20T10:00:00.000Z',
  ...extra,
});

export const SEED_TOOLS: Tool[] = [
  t('video-search-hub', '影视聚合搜索', '一个输入框搜遍多个片源，只做索引不做存储，支持按清晰度与字幕筛选。', '影视工具', ['搜索', '聚合'], { hot: true, icon: '🎬' }),
  t('subtitle-batch', '字幕批量下载器', '输入剧集目录，按文件名自动匹配并下载对应语言字幕，支持 SRT/ASS 转换。', '影视工具', ['字幕', '批处理'], { icon: '💬' }),
  t('video-transcode', '视频转码工作台', '基于 ffmpeg 的可视化转码：批量压缩、抽帧、转 GIF、裁切，配置可存成预设。', '影视工具', ['ffmpeg', '转码'], { icon: '🎞️' }),
  t('img-dewatermark', '图片去水印', '框选水印区域，浏览器本地完成修复，图片不上传服务器。', '去水印', ['Canvas', 'inpainting'], { icon: '🩹' }),
  t('video-dewatermark', '视频去水印', '逐帧修复 + 时序对齐，输出无闪烁结果。仅限自有版权素材。', '去水印', ['视频', '合规'], { icon: '🎥' }),
  t('boss-helper', 'BOSS 求职助手', '自研插件：岗位信息一键结构化、匹配度打分、批量投递与状态回收。', '浏览器插件', ['自研', '求职'], { hot: true, icon: '🧭' }),
  t('page-ruler', '网页标尺', '量任意元素尺寸、间距、字体，支持吸附与取色。', '浏览器插件', ['调试', 'UI'], { icon: '📏' }),
  t('json-viewer', 'JSON 格式化', '自动识别接口返回的 JSON，折叠、搜索、路径复制。', '浏览器插件', ['调试', 'JSON'], { icon: '🧾' }),
  t('snake-game', '贪吃蛇', '键盘 + 触屏都能玩，最高分存本地。', '小游戏', ['Canvas', '经典'], { icon: '🐍' }),
  t('game-2048', '2048', '支持撤销与历史最高分，动画流畅。', '小游戏', ['React', '经典'], { icon: '🔢' }),
  t('typing-test', '打字速度测试', '中英文双语，统计 WPM、准确率与错字热区。', '小游戏', ['练习', '统计'], { icon: '⌨️' }),
  t('nowcoder-sync', '牛客题库同步器', '一条命令把前端校招题库抓成本地 JSON，含分类打标与进度保留。', '开发工具', ['爬虫', 'Node'], { hot: true, icon: '📚' }),
  t('prompt-vault', '提示词仓库', '按场景归档常用提示词，支持变量占位与一键复制。', 'AI 工具', ['Prompt', '效率'], { icon: '🗂️' }),
  t('resume-polish', 'AI 简历润色', '把 JD 和自己的经历一起喂进去，输出对齐岗位的要点改写。', 'AI 工具', ['LLM', '求职'], { icon: '✨' }),
  t('job-hunter-console', '简历投递系统', '自动扫岗、匹配打分、批量投递、看板跟踪——点开直接进中台。', '我的项目', ['求职', '自动化', 'Node'], { url: 'http://127.0.0.1:8080', hot: true, icon: '🚀' }),
  t('portfolio-site', '本站：前后端分离的个人集市', 'React + TypeScript 前端，Express + TS 后端，Monorepo 管理；博客、工具集市、项目展示三合一。', '我的项目', ['React 18', 'TypeScript', 'Vite', 'Tailwind', 'Express'], { repo: 'https://github.com/', icon: '🏗️' }),
  t('nowcoder-project', '牛客题库同步器', '零依赖 Node 脚本，串行抓取 461 道前端面试题，自动分类并保留个人掌握度进度。', '我的项目', ['Node.js', '爬虫', '正则'], { to: '/posts/nowcoder-461-questions', icon: '📚' }),
  t('qqbot', 'QQ 机器人播报', '把中台的关键指标同步到手机：今日投递数、新邀约、待笔试提醒。', '我的项目', ['Bot API', 'Node.js'], { repo: 'https://github.com/', icon: '🤖' }),
  t('extensions', '浏览器插件集', '求职助手、网页标尺、JSON 格式化三个自用插件，覆盖调试与效率场景。', '我的项目', ['Manifest V3', 'Content Script', 'Service Worker'], { to: '/posts/chrome-extension-from-zero', icon: '🧩' }),
  t('games', '小游戏合集', '贪吃蛇、2048、打字测试，用 Canvas 与 React 各实现一遍，练手感也练动画。', '我的项目', ['Canvas', 'React', 'CSS 动画'], { repo: 'https://github.com/', icon: '🎮' }),
  t('qingbei-coach', '清北成长助手', '目标拆解 + 弱科诊断 + 全网课程导航：把清北目标拆到每一科，按差距自动推荐该补的课。', '学习工具', ['学习', '高考', '目标管理', '课程导航', '河北'], { createdAt: '2026-10-18T20:00:00.000Z', hot: true, icon: '🎓' }),
];

// 项目已并入 tools（分类：我的项目），不再单独维护 projects 模块。

// 友链/评论不做演示种子：只保留真实数据。文件缺失时创建空数组，
// 由真实的互链与读者留言逐条填入（用户 2026-10-18 明确：不要假数据）。

export const SEED_TIMELINE: TimelineItem[] = [
  { id: 't_site', date: '2026-10-17', title: '博客站「一只狡猾的狐狸」上线', desc: '前后端分离：React + TS 前端、Express + TS 后端、JSON 存储；含工具集市、归档、友链、留言板。', kind: 'site', createdAt: now },
  { id: 't_nc', date: '2026-10-15', title: '牛客 461 题全量入库', desc: '零登录抓取 + 正则打标，掌握度与收藏进度单独持久化，可勾选转博客草稿。', kind: 'study', createdAt: now },
  { id: 't_jh', date: '2026-10-12', title: '求职自动化中台 0 → 1', desc: '自动扫岗、四维匹配打分、批量投递、看板跟踪、QQ 机器人每日播报。', kind: 'project', createdAt: now },
];

export function ensureSeed(): void {
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(path.join(dataDir, 'posts.json'))) writeJson('posts.json', SEED_POSTS);
  if (!fs.existsSync(path.join(dataDir, 'tools.json'))) writeJson('tools.json', SEED_TOOLS);
  if (!fs.existsSync(path.join(dataDir, 'meta.json'))) writeJson('meta.json', SEED_META);
  if (!fs.existsSync(path.join(dataDir, 'timeline.json'))) writeJson('timeline.json', SEED_TIMELINE);
  // 友链 / 评论 / 赞赏：无演示数据，缺失即空数组（真实数据由使用过程填入）
  if (!fs.existsSync(path.join(dataDir, 'friends.json'))) writeJson('friends.json', []);
  if (!fs.existsSync(path.join(dataDir, 'comments.json'))) writeJson('comments.json', []);
  if (!fs.existsSync(path.join(dataDir, 'donations.json'))) writeJson('donations.json', []);
}

// 允许 `npm run seed -- --force` 覆盖（内容文件重置为种子；friends/comments/donations 重置为空）
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const force = process.argv.includes('--force');
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  if (force) {
    for (const f of ['posts.json', 'tools.json', 'meta.json', 'friends.json', 'comments.json', 'timeline.json', 'donations.json']) {
      try { fs.unlinkSync(path.join(dataDir, f)); } catch { /* ignore */ }
    }
  }
  ensureSeed();
  console.log('[seed] done →', dataDir);
}

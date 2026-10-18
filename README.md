# 一只狡猾的狐狸 · 个人博客 / 工具集市 / 项目展示

一个前后端分离的全栈个人站。定位不是「技术博客」，而是**一个集市**：文章、工具、项目、学习路线都在里面，
把求职自动化中台作为其中一个模块展示出来，方便面试官一眼看到「做过什么、怎么做的」。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router | 手写设计系统（CSS 变量双主题），不引 UI 库 |
| 后端 | Node + Express + TypeScript | REST，JSON 文件存储，写入原子化 |
| 工具运行时 | 任务队列 + 子进程（ffmpeg / Python+Pillow / Node 脚本） | 重活跑服务端，前端轮询进度；详见「工具运行时」 |
| 内容 | Markdown（react-markdown + GFM） | 文章正文存 Markdown，前后端都不用富文本编辑器 |
| 工程 | npm workspaces（monorepo） | 一条命令起双端 |

## 快速开始

```bash
npm install            # 首次
npm run dev            # 同时起 api(3001) + web(5173)
```

Windows 直接双击 `start.bat`；单端口生产模式双击 `start-prod.bat`（构建后由 API 托管 dist，只占 3001）。

首次启动会自动灌入示例内容（8 篇文章 / 14 个工具 / 6 个项目），数据落在 `apps/api/data/*.json`。
想恢复示例数据：`npm run seed -- --force`。

## 目录结构

```
portfolio/
├─ apps/
│  ├─ web/                    # 前端
│  │  └─ src/
│  │     ├─ pages/            # Home / Posts / PostDetail / Tools / ToolRunner / Archives / Friends / Guestbook / About / Admin
│  │     ├─ components/       # Layout(导航+搜索+主题) / ui(卡片+分页)
│  │     ├─ tools/            # 工具注册表 registry.ts + 运行时基建 runtime.tsx + builtins/（13 个可用工具）
│  │     └─ lib/              # api.ts（请求与 useApi）+ types.ts
│  └─ api/                    # 后端
│     ├─ src/
│     │  ├─ index.ts          # 入口：路由挂载 + 聚合搜索 + 静态托管
│     │  ├─ routes/           # posts / tools / extra(归档友链留言时间线) / toolkit(工具运行时)
│     │  ├─ services/         # toolkit(队列/配置/进程/路径守卫) + media/subtitle/resume/videosearch/handlers
│     │  ├─ store.ts          # JSON 读写（临时文件 + rename 原子写）
│     │  ├─ auth.ts           # x-admin-token 校验
│     │  └─ seed.ts           # 示例内容
│     ├─ scripts/             # 子进程脚本：img_clean.py（Pillow 去水印）/ nowcoder_sync.cjs（牛客抓题）
│     └─ data/*.json          # 内容即数据（+ work/ 任务状态与输出）
└─ start.bat / start-prod.bat
```

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/meta` | 站点信息 + 分类字典 + 分类计数 |
| GET | `/api/stats` | 文章/工具/项目/阅读数聚合 |
| GET | `/api/search?q=` | 集市式聚合搜索（文章 + 工具 + 项目） |
| GET | `/api/posts?cat=&q=&tag=&page=&size=&sort=` | 文章列表（默认只出 published） |
| GET | `/api/posts/facets` | 分类与标签计数 |
| GET | `/api/posts/:slug` | 文章详情（带相关推荐，阅读数 +1） |
| POST/PATCH/DELETE | `/api/posts`、`/api/posts/:id` | 写操作，需 `x-admin-token` |
| GET | `/api/tools?cat=&q=&hot=1` | 工具集市（含各分类计数） |
| GET | `/api/toolkit/env` | 工具运行时环境检测（ffmpeg/Python/Pillow/根目录） |
| POST | `/api/toolkit/jobs` | 创建工具任务（转码/去水印/字幕/题库同步…），串行队列执行 | 
| GET | `/api/toolkit/jobs/:id` | 任务进度/日志/结果（前端轮询） |

完整契约见 [`docs/API.md`](docs/API.md)（含工具运行时的全部接口与实现约定）。

管理 token 默认 `dev-token`，可用环境变量覆盖：`ADMIN_TOKEN=xxx npm run dev:api`。
前端「管理」页右上角填同一个 token 即可写文章。

## 工具运行时（本机服务器模式）

用户决策：**本地电脑即服务器**，自行开发测试、写接口；后期买云服务再上线。工具集市里 20 个卡片分三类：

| 类型 | 数量 | 例子 | 运行方式 |
| --- | --- | --- | --- |
| 纯前端 builtin | 6 | JSON 格式化 / 提示词仓库 / 网页标尺 / 2048 / 贪吃蛇 / 打字测速 | 站内直接渲染 |
| 服务端 builtin | 7 | 影视聚合搜索 / 图片去水印 / 视频转码 / 视频去水印 / 字幕工具箱 / 简历润色 / 牛客题库同步 | `/api/toolkit/*` 任务队列 + ffmpeg/Pillow 子进程 |
| 外链 / 说明 | 7 | 求职中台 / 本站 / 牛客项目 / QQBot / 插件集 / 小游戏 / BOSS 助手（扩展，仅说明） | 新窗口或「即将上线」说明页 |

新增一个服务端工具 = `services/handlers.ts` 注册处理器 + `tools/registry.ts` 映射组件，前端零改动。
视频类工具依赖 ffmpeg：把静态版解压到 `E:\WorkBuddy\tools\ffmpeg\bin\`（或在工具页「环境检测」里配置路径），未安装时界面会显示缺失并给出指引。

**权限系统（本地模式）**：含隐私数据的模块（婚礼礼账本）已接入登录鉴权——默认管理员 `admin / admin1234`（首次启动自动创建，控制台会打印警告，请尽快在「账户」页改密）；普通用户仅能读与记账，清空、用户增删改仅管理员。Token 为 HMAC 自签 JWT 风格、30 天有效，前端 `lib/api.ts` 自动随请求携带；新增受保护模块只需在路由包一层 `requireAuth()` 或 `requireAuth('admin')`（见 `docs/API.md` 权限系统章节）。

## 页面

- **首页**：Hero + 站点统计 + 四入口 + 精选项目 + 最新文章 + 工具精选 + 中台 CTA
- **博客**：分类 chips（带计数）/ 关键词搜索（防抖 + URL 同步）/ 分页，六个一页
- **文章**：Markdown 渲染（表格、代码块、引用）、标签、相关推荐
- **工具集市**：八大分类 + 热门筛选；22 个工具中 14 个可站内打开即用（含「开发者工具箱」的 9 个小功能），点卡片即进 `/tools/:slug` 运行时
- **导航**：10 个分类 362 条常用站点收录（导航目录数据来自 `apps/api/data/nav.json`），支持搜索与分类筛选，外链新标签打开
- **项目**：精选大卡 + 常规网格，带亮点列表与技术栈
- **控制台**：把求职自动化中台嵌成站内模块，带在线状态探测与未启动引导
- **关于**：技术栈 / 四层 AI 全栈路线 / 站点架构说明
- **管理**：文章列表 + Markdown 编辑器（草稿/发布/置顶/删除）

全局还有：`⌘K` / `Ctrl+K` 聚合搜索、深浅主题切换（localStorage + 系统偏好）、移动端折叠导航。

### 赞赏 / 咨询二维码怎么换

三张图直接替换 `apps/web/public/donate/` 下的同名文件，然后重新 `npm run build` 即生效（路径写在 `apps/api/data/donate.json` 与 `license.json` 里，改名的话两边一起改）：

| 文件 | 用途 | 当前尺寸 |
|---|---|---|
| `wechat.png` | 微信收款码 | 415×415 |
| `alipay.png` | 支付宝收款码 | 900×900 |
| `contact-wechat.png` | 源码授权页的「微信扫码咨询」 | 717×717 |

建议先用截图工具把二维码裁成正方形再加一圈白边（静区），整张宣传海报直接塞进 220px 的框里二维码只有 60px 左右，手机扫不出来。裁图脚本在 `E:\WorkBuddy\tools\qr-prep.py`（自动求墨迹包围盒）。

## 部署

**方案 A：单机（最省事）**
`npm run build` 后 `npm run start`，Express 同时提供 API 和前端静态文件，只开 3001 一个端口，Nginx 反代 + HTTPS 即可。

**方案 B：前后端分开**
前端 `apps/web/dist` 丢 Vercel / Cloudflare Pages，后端跑在小服务器上；前端用 `VITE_API_BASE=https://api.xxx.com` 指向后端，记得配 CORS。

**注意**：求职自动化中台（`job-hunter`）必须留在**本地机器**跑——它依赖你已登录的浏览器做真实投递。
云端只放「展示用」的博客站，中台通过内网/本机访问。

### 上线前检查清单

1. **换掉硬编码地址**：`apps/web/src/pages/Home.tsx` 和 `Console.tsx` 里求职中台的外链写的是 `http://127.0.0.1:8080`，上线前改成你的域名或内网穿透地址（或用 `import.meta.env.VITE_CONSOLE_URL` 注入）。
2. **改管理 token**：`ADMIN_TOKEN=你的强口令 npm run start`，别用默认 `dev-token`。
3. **改默认管理员密码**：首次启动后到「账户」页把 `admin / admin1234` 改掉，别用默认口令（改密会立即作废所有旧 Token）。
4. **监听地址**：默认只监听 `127.0.0.1`（工具运行时能读写本机文件，不要裸奔到公网）。确实需要对外时 `HOST=0.0.0.0 npm run start`，并先给 `/api/toolkit/*` 加鉴权。
5. **端口**：默认 3001，可用 `PORT=8080 npm run start` 覆盖。
6. **进程守护**：小服务器用 `pm2 start "npm run start" --name portfolio`（或 `tsx src/index.ts`），保证崩了自动拉起。
7. **反向代理 + HTTPS**：Nginx 把 `你的域名` 反代到 `127.0.0.1:3001`，配 Let's Encrypt 证书。
8. **备案**：域名解析到**大陆服务器**必须 ICP 备案（腾讯云/阿里云控制台一键申请）；用香港/海外轻量可免备案但国内访问偏慢。
9. **数据备份**：`apps/api/data/*.json` 是整个站的内容，定期打包备份即可（暂未上数据库，备份成本低）。

> 进阶：内容多了把 JSON 换成 SQLite（`better-sqlite3`），接口层一行都不用改；或把前端丢 Vercel/CF Pages、后端留小服务器（记得开 CORS）。

## 后续路线

1. 存储升级：JSON → SQLite（`better-sqlite3`），接口层不动
2. 工具扩充：按 handlers + registry 两处注册继续加（如下载器、格式工厂类）
3. 时间线页面：`/api/timeline` 数据与接口已就绪，前端页待做
4. 文章详情页评论区接入（留言板已做，接口通用）
5. 部署上线：域名 + HTTPS + 备案（工具运行时的文件接口加鉴权后再公网）

## 跨端兼容基线（P0 · 用户 2026-10-17 提出）

> 用户原话：「最好做一个 PC 端加移动端、安卓端、OS 端都能用的那种，都是可以兼容的。」

目标：一套 React 代码 + 一个域名，PC 浏览器 / 手机浏览器（Android + iOS）/ 可安装（PWA），体验一致可用。

### 现状盘点（2026-10-17）
- 已具备：Tailwind 响应式断点（`sm:` / `md:` / `lg:` 在 Home、Tools、Projects 页已用），容器 `max-w-content px-5` 自适应
- 缺口：`index.html` 无 `viewport-fit=cover`；`index.css` 无 `env(safe-area-inset-*)`、无 `100dvh` 兜底；无 PWA manifest / Service Worker；导航在手机上是横向滚动还是折叠未验证；触控目标未统一到 44px

### 硬性要求
1. **断点**
   - `<640` 手机：单列；导航收起为抽屉或底部 Tab；表格类内容降级为卡片；按钮/输入 ≥44px 高
   - `640–1024` 平板：两列网格
   - `≥1024` PC：三/四列，保持现有信息密度
2. **iOS Safari**
   - `100vh` → `100dvh`，避免地址栏挤掉底部按钮
   - `viewport-fit=cover` + 底部固定元素加 `padding-bottom: env(safe-area-inset-bottom)`
   - 表单 `font-size ≥16px`，防聚焦自动放大
   - 补 `-webkit-tap-highlight-color` 与 `:active` 反馈
3. **Android / 国产内核**（微信、QQ、UC）
   - 关键布局不依赖 `position: sticky`，降级 fixed
   - 拖拽/滑动用 Pointer Events
   - 接口请求加 `AbortController` 超时兜底（弱网不白屏）
4. **桌面端**
   - 深色模式跟随 `prefers-color-scheme`，同时保留手动切换（现已手动，补跟随）
   - `⌘/Ctrl+K` 搜索保留，移动端隐藏快捷键提示
5. **可安装（PWA）**
   - `manifest.webmanifest`（name/short_name/theme_color/display:standalone + 192/512 图标）
   - Service Worker 缓存壳（首页 + 静态资源），离线给提示页
   - `apple-touch-icon` 补齐，iOS「添加到主屏幕」可用
   - 需要推送再考虑 Capacitor 套壳，不做原生重写

### 验收清单
- [ ] Chrome DevTools 375 / 390 / 768 / 1440 四档截图无横向滚动
- [ ] iPhone Safari：底部/吸附元素不被地址栏遮挡，刘海屏不压内容
- [ ] 触控目标 ≥44×44px，相邻间距 ≥8px
- [ ] 横竖屏切换布局不塌
- [ ] 深色模式对比度 ≥4.5:1
- [ ] 断网时不白屏，有明确提示

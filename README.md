# 一只狡猾的狐狸 · 个人博客 / 工具集市

> 🦊 一个前后端分离的全栈个人站：文章系统、工具集市、任务队列、权限体系、垂直业务模块。
> **私有项目** —— 个人自用，未经授权请勿使用或分发。

定位不是「技术博客」，而是一个**集市**：文章、工具、项目、学习路线都在里面，
把求职自动化中台也做成其中一个模块展示，方便面试官一眼看到「做过什么、怎么做的」。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router | 手写设计系统（CSS 变量双主题），不引 UI 库 |
| 后端 | Node + Express + TypeScript | REST，JSON 文件存储，写入原子化 |
| 数据库 | MySQL 8（mysql2 连接池 + 版本化迁移） | 账号 / 会话等鉴权数据走 MySQL；内容数据仍是 JSON |
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

### 首次启动需要准备什么

| 依赖 | 是否必需 | 说明 |
| --- | --- | --- |
| Node.js 20+ | **必需** | 建议用 nvm 管理版本 |
| MySQL 8 | 必需 | 账号 / 会话 / 清北模块的数据存在这里；也可只跑内容部分（见下） |
| ffmpeg | 可选 | 视频转码 / 去水印 / 字幕工具要用；装好后把路径配进 `tool-config.json` |
| Python 3 + Pillow | 可选 | 图片去水印要用 |

**MySQL 建库**（一条命令）：

```sql
CREATE DATABASE portfolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'portfolio'@'127.0.0.1' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON portfolio.* TO 'portfolio'@'127.0.0.1';
```

然后复制 `apps/api/.env.example` 为 `apps/api/.env` 并按需修改（连接信息、端口等）。
迁移脚本会在 API 启动时自动执行（`apps/api/src/db/migrations/`），无需手动建表。

**只想跑内容部分、不想装 MySQL？** 把 `apps/api/src/index.ts` 里的 `initDb()` 相关启动步骤注释掉即可——
文章、工具、归档、友链、留言、RSS 全部走 JSON 文件，不依赖数据库；
只有登录、评论提交、婚礼礼账本、清北成长助手这几个模块需要鉴权。

## 目录结构

```
portfolio/
├─ apps/
│  ├─ web/                    # 前端
│  │  └─ src/
│  │     ├─ pages/            # Home / Posts / PostDetail / Tools / ToolRunner / Archives / Friends / Guestbook / Nav / Donate / License / About / Admin / NotFound
│  │     ├─ components/       # Layout(导航+搜索+主题) / Sidebar / PostRow / Comments / AuthModal / UserMenu / ui(卡片+分页)
│  │     ├─ tools/            # 工具注册表 registry.ts + 运行时基建 runtime.tsx + builtins/（站内可用的工具组件）
│  │     └─ lib/              # api.ts（请求与 useApi）+ auth.ts（会话）+ types.ts
│  └─ api/                    # 后端
│     ├─ src/
│     │  ├─ index.ts          # 入口：路由挂载 + 聚合搜索 + RSS + 静态托管
│     │  ├─ routes/           # posts / tools / extra(归档友链留言时间线) / toolkit(工具运行时) / wedding / qingbei / auth / ai
│     │  ├─ services/         # toolkit(队列/配置/进程/路径守卫) + auth(密码+Token) + media/subtitle/resume/videosearch/handlers
│     │  ├─ repo/             # auth DAO（账号/会话数据访问的唯一通道，换库只改这里）
│     │  ├─ db.ts             # MySQL 连接池 + 版本化迁移执行器
│     │  ├─ store.ts          # JSON 读写（临时文件 + rename 原子写）
│     │  ├─ auth.ts           # 管理员鉴权（ADMIN_TOKEN 或 JWT admin）
│     │  └─ seed.ts           # 示例内容
│     ├─ scripts/             # 子进程脚本：img_clean.py（Pillow 去水印）/ nowcoder_sync.cjs（牛客抓题）
│     └─ data/*.json          # 内容即数据（+ work/ 任务状态与输出）
├─ docs/                      # API 契约 / 架构巡检 / 云上线方案 / QA 报告
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

管理接口的写操作需要 `x-admin-token` 请求头。
该 token 由环境变量 `ADMIN_TOKEN` 提供；**未设置时这条通道直接关闭**（只剩右上角登录签发的 JWT 一条路），
需要兼容旧调用方时显式设 `ADMIN_TOKEN=你的强口令`。

## 工具运行时（本机服务器模式）

用户决策：**本地电脑即服务器**，自行开发测试、写接口；后期买云服务再上线。工具集市里 24 个卡片分三类：

| 类型 | 数量 | 例子 | 运行方式 |
| --- | --- | --- | --- |
| 纯前端 builtin | 6 | JSON 格式化 / 提示词仓库 / 网页标尺 / 2048 / 贪吃蛇 / 打字测速 | 站内直接渲染 |
| 服务端 builtin | 7 | 影视聚合搜索 / 图片去水印 / 视频转码 / 视频去水印 / 字幕工具箱 / 简历润色 / 牛客题库同步 | `/api/toolkit/*` 任务队列 + ffmpeg/Pillow 子进程 |
| 外链 / 说明 | 7 | 求职中台 / 本站 / 牛客项目 / QQBot / 插件集 / 小游戏 / BOSS 助手（扩展，仅说明） | 新窗口或「即将上线」说明页 |

新增一个服务端工具 = `services/handlers.ts` 注册处理器 + `tools/registry.ts` 映射组件，前端零改动。
视频类工具依赖 ffmpeg：装好后把可执行文件路径填进 `apps/api/data/tool-config.json` 的 `ffmpegPath`
（或设环境变量 `FFMPEG_PATH`），未安装时界面会显示缺失并给出指引。
Python 同理：填 `pythonPath` 或设 `PYTHON_PATH`。
`tool-config.json` 含本机环境信息，已在 `.gitignore` 中，仓库不提供——首次使用按上面的说明自建一份即可。

**权限系统**：含隐私数据的模块（婚礼礼账本）已接入登录鉴权——首次启动会**随机生成**管理员密码并打印在后端控制台
（只显示一次，务必保存；也可在启动前设 `AUTH_ADMIN_PW=你的口令` 指定固定密码），随后请到「账户」页改密；
普通用户仅能读与记账，清空、用户增删改仅管理员。
Token 为 HMAC 自签 JWT 风格、30 天有效，前端 `lib/api.ts` 自动随请求携带；
新增受保护模块只需在路由包一层 `requireAuth()` 或 `requireAuth('admin')`（见 `docs/API.md` 权限系统章节）。

## 页面

- **首页**：Hero + 站点统计 + 四入口 + 精选项目 + 最新文章 + 工具精选 + 中台 CTA
- **博客**：分类 chips（带计数）/ 关键词搜索（防抖 + URL 同步）/ 分页，六个一页
- **文章**：Markdown 渲染（表格、代码块、引用）、标签、相关推荐
- **工具集市**：八大分类 + 热门筛选；24 个工具中 14 个可站内打开即用（含「开发者工具箱」的 9 个小功能），点卡片即进 `/tools/:slug` 运行时
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
| `contact-wechat.png` | 授权页（`/license`）的「微信扫码交流」 | 717×717 |

建议先用截图工具把二维码裁成正方形再加一圈白边（静区），整张宣传海报直接塞进 220px 的框里二维码只有 60px 左右，手机扫不出来。

## 部署

**方案 A：单机（最省事）**
`npm run build` 后 `npm run start`，Express 同时提供 API 和前端静态文件，只开 3001 一个端口，Nginx 反代 + HTTPS 即可。

**方案 B：前后端分开**
前端 `apps/web/dist` 丢 Vercel / Cloudflare Pages，后端跑在小服务器上；前端用 `VITE_API_BASE=https://api.xxx.com` 指向后端，记得配 CORS。

**注意**：求职自动化中台（`job-hunter`）必须留在**本地机器**跑——它依赖你已登录的浏览器做真实投递。
云端只放「展示用」的博客站，中台通过内网/本机访问。

### 上线前检查清单

1. **换掉硬编码地址**：`apps/web/src/pages/Home.tsx` 里求职中台的外链默认是 `http://127.0.0.1:8080`，
   上线前用 `VITE_CONSOLE_URL` 注入你的域名（或改成你自己的项目地址）。
2. **确认管理员口令**：首次启动的控制台输出里有随机生成的管理员密码，登录后立刻在「账户」页改掉。
   若要用 `x-admin-token` 走旧接口，设 `ADMIN_TOKEN=你的强口令`（不设则该通道关闭）。
3. **数据库口令**：`apps/api/.env` 里的 `DB_PASSWORD` 不要用弱口令；`.env` 已被 `.gitignore` 忽略，确认没误提交。
4. **监听地址**：默认只监听 `127.0.0.1`（工具运行时能读写本机文件，不要裸奔到公网）。确实需要对外时 `HOST=0.0.0.0 npm run start`，并先给 `/api/toolkit/*` 加鉴权。
5. **端口**：默认 3001，可用 `PORT=8080 npm run start` 覆盖。
6. **进程守护**：小服务器用 `pm2 start "npm run start" --name portfolio`（或 `tsx src/index.ts`），保证崩了自动拉起。
7. **反向代理 + HTTPS**：Nginx 把 `你的域名` 反代到 `127.0.0.1:3001`，配 Let's Encrypt 证书。
8. **备案**：域名解析到**大陆服务器**必须 ICP 备案（腾讯云/阿里云控制台一键申请）；用香港/海外轻量可免备案但国内访问偏慢。
9. **数据备份**：`apps/api/data/*.json`（内容）与 MySQL（账号会话）都要定期备份。

> 进阶：内容多了把 JSON 换成 SQLite（`better-sqlite3`），接口层一行都不用改；或把前端丢 Vercel/CF Pages、后端留小服务器（记得开 CORS）。

## 路线图

后续可做的方向：

1. **工具扩充**：按 `services/handlers.ts` + `tools/registry.ts` 两处注册继续加（下载器、格式工厂、剪贴板工具……）
2. **存储统一**：内容侧 JSON → PostgreSQL，接口层不动（DAO 抽象已就绪，只改 `repo/` 与 `db.ts`）
3. **时间线页面**：`/api/timeline` 数据与接口已就绪，前端页待做
4. **PWA 完善**：Service Worker 离线壳、`100dvh` 适配 iOS 地址栏、触控目标 ≥44px 的统一规范
5. **国际化**：目前纯中文，抽出文案层后即可加多语言
6. **无障碍**：键盘导航、焦点可见、`aria-live` 播报

## 项目说明

本仓库为**私有项目**，版权归作者所有，未授予任何使用、修改、商用或再分发许可。
下列内容只记录自用的工程约定，不构成对外授权。

### 不含在仓库里的东西

| 内容 | 原因 |
| --- | --- |
| `apps/api/data/tool-config.json` | 含本机磁盘路径与 LLM 密钥，按需自建 |
| `apps/api/data/auth.json` | 密码哈希与 Token 签名密钥，运行时生成 |
| `apps/api/data/*.db` | MySQL 之外的本地运行时数据 |
| `apps/api/data/{comments,friends,donations}.json` | 用户生成内容，运行时自动建空文件 |
| `apps/api/data/work/`、`job-sync/` | 工具任务产物与个人求职数据 |
| `.env` | 本地配置（模板见 `apps/api/.env.example`） |

### 安全默认值

个人站最容易被忽略的问题是「默认密码 / 默认后门」，本仓库做了这些处理：

- 首次启动**随机生成**管理员密码并打印到控制台，不用固定口令（可用 `AUTH_ADMIN_PW` 指定）
- `ADMIN_TOKEN` 未设置时，`x-admin-token` 这条旧式管理员通道**直接关闭**，只保留 JWT 鉴权
- 工具运行时的文件访问白名单默认只含「项目目录」与「用户主目录」，不再整盘放行
- 路径守卫 `isSensitivePath()` 拦截 `data/`、系统目录、`.git`/`.ssh`/`.env`、各类私钥文件
- 工具接口可用 `ENABLE_TOOLKIT=0` 整体关闭——**公网部署务必设这个**

### 维护提示

| 想改什么 | 改哪里 |
| --- | --- |
| 加一个纯前端工具 | `apps/web/src/tools/builtins/` 建组件 + 在 `registry.ts` 注册 |
| 加一个服务端工具 | `apps/api/src/services/handlers.ts` 注册处理器 + `registry.ts` 映射 |
| 加一个页面 | `apps/web/src/pages/` 建组件 + 在路由表挂载 |
| 改内容数据 | 直接编辑 `apps/api/data/*.json`，或写接口用管理员 token |
| 换数据库 | 只改 `apps/api/src/db.ts` 与 `repo/auth.ts`，上游业务代码零改动 |

---

私有项目，仅自用记录，不对外提供代码、部署或技术支持。

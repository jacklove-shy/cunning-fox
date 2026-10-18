# 博客站 API 契约 · 「一只狡猾的狐狸」

> 所有接口当前由 Express + `apps/api/data/*.json` **静态驱动**；后期买服务器，只需把 `store.ts` 的
> `readJson / writeJson` 换成真实数据库 / 远程服务（或在前端改 `VITE_API_BASE` 指向线上服务），
> **前端调用方式完全不变**。本文档即"预留接口"的单一事实来源。
>
> 约定：写操作默认需要请求头 `x-admin-token`（值取环境变量 `ADMIN_TOKEN`，默认 `dev-token`）；
> 例外：`POST /api/comments`（留言板）当前演示开放，生产环境务必加验证码 / 限流 / 审核。

## 站点
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 | `{ ok, service, at }` |
| GET | `/api/meta` | 站点信息 + 分类计数 | `{ site, postCats[], toolCats[], facets:{ postCats, toolCats } }` |
| GET | `/api/stats` | 统计 | `{ posts, drafts, tools, projects, views, lastUpdated }` |
| GET | `/api/search?q=` | 聚合搜索 | `{ q, posts[], tools[] }` |

## 文章
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/posts?cat=&tag=&q=&page=&size=&status=&sort=new\|views` | 列表（分页/筛选/排序，置顶优先） | `Page<Post 去 content + wordCount>` |
| GET | `/api/posts/facets` | 分类 / 标签聚合 | `{ cats:{}, tags:{}, total }` |
| GET | `/api/posts/:slug` | 详情（`views` 自增，附相关/上下篇） | `{ ...post, related[], prev, next }` |
| POST | `/api/posts/:slug/view` | **预留**：显式阅读计数（防刷可限流） | `{ ok, views }` |
| POST | `/api/posts` | 新建（admin） | `201 Post` |
| PATCH | `/api/posts/:id` | 更新（admin） | `Post` |
| DELETE | `/api/posts/:id` | 删除（admin） | `{ ok, id }` |

## 工具集市
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/tools?cat=&hot=&q=` | 工具列表 | `{ items: Tool[], total }` |
| — | 工具"能否在线用" | 由**前端注册表** `apps/web/src/tools/registry.ts` 驱动（纯前端可用的进站内运行时，需后端的标"即将上线"），不依赖数据字段 | — |

## 归档 / 友链 / 留言 / 时间线（预留模块）
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/archives` | 按 `YYYY-MM` 分组的文章归档（倒序） | `{ groups:[{ month, posts[] }], total }` |
| GET | `/api/friends` | 友链 | `{ items: Friend[] }` |
| POST | `/api/friends` | 新增友链（admin） | `201 Friend` |
| GET | `/api/comments?slug=` | 留言 / 评论（`slug` 缺省=留言板） | `{ items: Comment[], total }` |
| POST | `/api/comments` | 提交留言（演示开放，生产需验证码/限流/审核） | `201 Comment` |
| GET | `/api/timeline` | 站点动态时间线（倒序） | `{ items: TimelineItem[], total }` |

## 数据模型（当前 JSON，后期映射到表结构）
- `Post`：`{ id, slug, title, summary, content, cat, tags[], status, views, pinned?, cover?, source?, createdAt, updatedAt }`
- `Tool`：`{ id, name, slug, desc, cat, url?, repo?, to?, tags[], hot?, icon?, createdAt }`
- `Friend`：`{ id, name, url, desc, avatar?, tag?, createdAt }`
- `Comment`：`{ id, slug?, nick, avatar?, content, top?, createdAt }`
- `TimelineItem`：`{ id, date, title, desc, kind: project|study|life|site, createdAt }`

## 数据文件（静态源）
`apps/api/data/`：`posts.json` · `tools.json` · `meta.json` · `friends.json` · `comments.json` · `timeline.json`

## 工具运行时（/api/toolkit/*，本机服务器模式）

> 本地电脑即服务器：重活（ffmpeg / Pillow / 爬虫）跑在**后端任务队列**里，前端轮询进度。
> 输出目录默认建在输入文件同级（如「视频转码输出_时间戳」），原文件不动。
> ⚠️ 这些接口会读写本机文件系统（有目录守卫，仅限配置的根目录），**只适合 127.0.0.1 自用**，公网部署前务必加鉴权与目录白名单。

### 环境与配置
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/toolkit/env` | 环境检测（ffmpeg/ffprobe/Python/Pillow、可浏览根目录、转码预设） | `{ ffmpeg, ffprobe, python, roots[], presets[], registered[] }` |
| POST | `/api/toolkit/config` | 保存配置（admin）：ffmpeg/python 路径、fsRoots、LLM | `ToolConfig` |
| GET | `/api/toolkit/fs?path=` | 浏览本机目录（dirs + files） | `{ path, parent, dirs[], files[] }` |
| GET | `/api/toolkit/raw?path=` | 内联预览文件（图片/视频/音频，用于工具内预览） | 二进制流 |
| GET | `/api/toolkit/files?path=` | 下载文件（attachment） | 二进制流 |
| POST | `/api/toolkit/zip` | 把输出目录打包成 zip（Windows: Compress-Archive） | `{ ok, path, size }` |

### 任务队列
| 方法 | 路径 | 说明 | 响应 |
| --- | --- | --- | --- |
| POST | `/api/toolkit/jobs` | 创建任务 `{ tool, title?, params }` | `201 { id, status }` |
| GET | `/api/toolkit/jobs` | 最近 20 个任务 | `{ items: ToolJob[] }` |
| GET | `/api/toolkit/jobs/:id` | 任务详情（前端 1.2s 轮询） | `ToolJob` |
| POST | `/api/toolkit/jobs/:id/cancel` | 取消（杀子进程） | `{ ok }` |

`ToolJob`：`{ id, tool, title, status: queued|running|done|error|canceled, progress, logs[], params, result?, error?, createdAt, finishedAt }`。
任务串行执行；服务重启后未完成任务标记为「中断」（状态持久化在 `data/work/jobs.json`）。

### 工具能力接口
| 方法 | 路径 | 工具 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/toolkit/search/videos?q=&type=&yearFrom=&yearTo=&sort=` | 影视聚合搜索 | 聚合 iTunes（电影，多 store + kind 过滤）+ TVMaze（剧集），标题+年份去重合并 |
| POST | `/api/toolkit/resume/polish` | 简历润色 | `{ text, useLlm? }` → 规则引擎（弱动词/空话/缺量化/超长检测 + 安全替换）或 LLM（`tool-config.json` 里配 OpenAI 兼容接口） |
| POST | `/api/toolkit/subtitle/plan-rename` | 字幕工具箱 | `{ dir, videoDir? }` → 字幕↔视频配对预览（不落盘） |
| POST | `/api/toolkit/jobs` (tool=`subtitle`) | 字幕工具箱 | `{ op: rename\|srt2vtt\|vtt2srt\|fix-encoding\|shift, dir, pairs?, shiftSeconds? }` |
| POST | `/api/toolkit/jobs` (tool=`img-dewatermark`) | 图片去水印 | `{ files[], mode: smart\|blur\|cover, rect:{x,y,w,h}(归一化), color }` → Python/Pillow 子进程 |
| POST | `/api/toolkit/jobs` (tool=`video-transcode`) | 视频转码 | `{ files[], preset: h264\|compress\|scale720\|gif\|audio\|webm }` → ffmpeg |
| POST | `/api/toolkit/jobs` (tool=`video-dewatermark`) | 视频去水印 | `{ files[], rect }` → ffmpeg `delogo` 区域抹除 |
| POST | `/api/toolkit/jobs` (tool=`nowcoder-sync`) | 牛客题库同步 | `{ from, to, delay }` → spawn `scripts/nowcoder_sync.cjs`（只读抓取） |
| GET | `/api/toolkit/nowcoder/questions?cat=&q=&page=&size=` | 牛客题库 | 浏览 `data/question_bank.json`（`{ questions[] }` 结构） |

### 关键实现约定
- **后端结构**：`services/toolkit.ts`（配置/队列/进程/路径守卫）+ `services/{media,subtitle,resume,videosearch,handlers}.ts`（各工具服务层）+ `routes/toolkit.ts`（HTTP 层）+ `scripts/`（Python/Node 子进程脚本）。
- **ffmpeg 定位顺序**：`tool-config.json` 的 `ffmpegPath` → `E:\WorkBuddy\tools\ffmpeg\bin\ffmpeg.exe` → PATH。未安装时视频类工具在界面显示「缺失」并给安装指引。
- **进度协议**：Python 脚本输出 `PROGRESS <pct> <msg>` / 末行 `RESULT <json>`；ffmpeg 解析 stderr `time=` 对比 ffprobe 时长。
- **目录守卫**：`guardPath()` 要求路径落在配置的 `fsRoots` 内（默认 C/D/E 盘根 + 用户目录）；写入只发生在「输入同级的新输出目录」。
- **后期上云**：工具若搬服务器，把 handlers 里的本地路径/子进程换成云函数或容器任务即可，前端协议不用变；影视搜索/简历 LLM 本身就是纯 HTTP，直接可用。

## 权限系统（/api/auth/*，本地服务器模式）

本地电脑当服务器使用，礼账含金额等隐私数据，因此接入了轻量鉴权。**零额外依赖**（仅用 Node 内置 `crypto`）。

### 安全策略
- **角色**：`admin`（全权限，含用户管理 / 清空）/ `user`（读 + 礼账 CRUD）。
- **密码**：scrypt + 随机盐存储；校验用 `timingSafeEqual` 防时序攻击。明文密码不落盘。
- **Token**：HMAC-SHA256 自签 JWT 风格（`header.payload.sig`，base64url），密钥持久化在 `data/auth.json`。有效期 30 天。
- **传输**：前端把 Token 存 `localStorage`，每次请求经 `Authorization: Bearer <token>` 自动带上；后端 `requireAuth(role?)` 中间件校验签名与过期，并按角色拦截。
- **默认账户**：首次启动若 `auth.json` 无用户，自动建 `admin / admin1234`（控制台会打印警告），请尽快在「账户」页改密。
- **越权防护**：读 / 写礼账需 `user`；清空全部、用户增删改仅 `admin`（前端也会对越权按钮做隐藏）。

### 端点
| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | 公开 | `{username,password}` → `{token,exp,username,role}` |
| GET | `/api/auth/me` | user | 当前会话信息 |
| POST | `/api/auth/change-password` | user | 改自己的密码 `{oldPassword,newPassword}` |
| GET | `/api/auth/users` | admin | 用户列表 |
| POST | `/api/auth/users` | admin | 建用户 `{username,password,role}` |
| DELETE | `/api/auth/users/:username` | admin | 删用户（默认 admin 不可删） |

### 婚礼礼账本（/api/wedding/*）受保护
除登录/健康检查外，所有婚礼接口均要求 `Authorization: Bearer`：
- `GET /` · `GET /entries` · `GET /stats` · `PUT /meta` · `POST /entries` · `PATCH /entries/:id` · `DELETE /entries/:id` → 需 **user**
- `DELETE /entries?confirm=clear`（清空）→ 需 **admin**

### 接入新受保护模块
1. 后端：在路由文件 `import { requireAuth } from '../middleware/auth.js'`，给 handler 包一层 `requireAuth()` 或 `requireAuth('admin')`。
2. 前端：`lib/api.ts` 已自动带 Token；未登录时调用返回 401，组件内用 `getSession()/isAuthed()` 判断并显示登录框（见 `tools/builtins/wedding/Login.tsx`）。
3. 账户/用户管理 UI 参考 `tools/builtins/wedding/AdminPanel.tsx`。

### 安全边界（2026-10-17 QA 加固）

| 项 | 说明 |
|---|---|
| 监听地址 | 默认 `127.0.0.1`；对外需显式 `HOST=0.0.0.0`（工具运行时无鉴权，勿在不可信网络开启） |
| 工具文件接口 | `fs/raw/files/zip` 只能访问 `fsRoots` 内路径；**应用 `data/` 目录整体禁止**（仅放行 `data/work/`），另拦截系统目录、`.git` / `.ssh`、`*.pem` / `*.key` / `*.pfx`、`.env*` |
| 鉴权状态码 | 未登录/凭据无效 → **401**；已登录但角色不足 → **403** |
| 改密失效 | 用户带密码版本号 `pv`，改密后旧 Token 立即失效（403/401） |
| 登录限流 | 同 `IP+用户名` 10 分钟内失败 8 次 → **429** |
| 注册限流 | 同 IP 每小时 5 个账号 → **429** |
| 评论身份 | `nick` 强制取 Token 用户，客户端传值被忽略 |
| 错误响应 | 统一 JSON：400 `bad_request` / 413 `payload_too_large` / 500 `server_error`，不再返回 HTML 错误页 |

完整测试结果见 [`docs/QA-REPORT.md`](./QA-REPORT.md)。

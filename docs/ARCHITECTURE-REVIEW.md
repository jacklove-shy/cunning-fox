# 架构巡检报告 · Round 11（架构师视角）

巡检时间：2026-10-18
巡检方式：Kimi 浏览器桥接实测线上站（10 路由遍历 + 登录后台 + 工具运行时点击）+ 前后端代码走读 + 接口耗时测量
巡检对象：`portfolio`（C 盘活版本，3001 单端口生产模式）

---

## 一、现状架构（实测）

```
浏览器 SPA ──→ Express 4（127.0.0.1:3001，同域托管 dist + /api）
                 ├─ 内容路由  posts / tools / extra(archives/friends/comments/donate/timeline)
                 ├─ 工具路由  toolkit（任务队列 + 子进程 ffmpeg/python/node + 文件浏览）
                 ├─ 其他      auth（自签 token）/ wedding / ai
                 └─ 数据层    apps/api/data/*.json（读一次全文件 parse，写 tmp+rename 原子替换）
job-hunter（8080，独立 Node 进程，浏览器桥接驱动真实 Chrome 投递）── 本站以外链方式引用
```

**实测数据**：

| 测量项 | 结果 |
|---|---|
| 10 条路由遍历 | 0 控制台错误 / 0 失败请求 |
| 首页 API 调用数 | **12 次**，其中 `/api/meta` 被独立调用 **4 次**（Layout×2 + Sidebar + Home），`/api/posts` 2 次（不同参数） |
| `/api/nav` 载荷 | 原始 79KB/次（文件 102KB），本地 5.8ms |
| 各接口本地耗时 | 3~7ms（JSON 全文件 parse，当前数据量下无感） |
| 工具任务队列 | 内存 Map + jobs.json 持久化，重启恢复标记中断，串行执行 |
| 前端产物 | index.js 543KB（gzip 168KB）无代码分割，css 61KB |

---

## 二、架构评估：这套设计做对了什么

先给结论：**作为一个"本机即服务器"的个人站，当前架构是清醒且自洽的**，以下决策建议继续保持：

1. **同域单端口部署**（Express 托管 dist + /api）：省一个域名/端口/反代，CORS 不存在，上线成本最低。
2. **零依赖安全体系**：scrypt + 自签 HMAC token + pv 密码版本号踢登录态，无 passport/jsonwebtoken 供应链暴露面。个人站这个复杂度是刚好，不是不足。
3. **工具运行时的安全设计**：`isSensitivePath` 黑名单（data/ 全禁除 work/、系统目录、.git/.ssh/私钥）+ `guardPath` 根目录校验——全网暴露面最大的模块处理得认真，HOST 默认 127.0.0.1 并在 0.0.0.0 时大声警告，这是对的。
4. **数据即文件**：JSON 可读可 diff 可 git，备份 = 复制目录，搬迁 = 复制目录。对个人站这是特性。
5. **任务队列的工程细节**：串行执行（ffmpeg 吃 CPU，并发没有意义）、行缓冲日志、取消传播到子进程、重启恢复、原子写——有工程素养。

---

## 三、问题与风险（按优先级）

### P0-1 前端无请求缓存，首页 12 连发（每次路由切换全重来）

`useApi` 是 per-component 的裸 fetch：`/meta` 被 4 个组件各要一次，无 inflight 合并、无 TTL 缓存、无路由保留。本地无感，上线后 = 4 倍首屏请求 + 4 倍解析。**这是模式问题，不是数据量问题。**

### P0-2 写路径无锁，JSON read-modify-write 有丢更新窗口

`writeJson` 是「读文件→改数组→整文件原子替换」。两个并发写（如两条赞赏认领同时来、或认领时管理员正好确认另一条）后写覆盖前写。当前串行任务队列救了 toolkit，普通路由没有任何互斥。概率低但真实存在，且**数据丢了无声无息**。

### P1-1 无压缩、无静态资源缓存头

`express.static(dist)` 裸奔：543KB JS + 61KB CSS 每次全量传输，且 hashed 文件名本可 `immutable` 长缓存。上线后这是最直接的一笔浪费。

### P1-2 无请求日志/慢请求可见性

现在只有 `console.error` 打未处理异常。哪个接口被刷、哪个慢了、谁在 4xx，全靠猜。本机当服务器，**日志就是仪表盘**。

### P1-3 前端无代码分割

react-markdown 只在 PostDetail 用，却打进主 bundle。一个动态 import 的事。

### P2-1 数据层无查询能力的天花板

评论/留言/礼账/赞赏都是全表扫 + 内存排序。数据量到几千条开始肉疼（尤其 nav 362 条每次全量下发）。**现在不用动，但要知道临界点在哪。**

### P2-2 产物目录只增不减

`data/work/<jobId>/` 没有任何清理策略，转码一次几个 G 的那种。

### P2-3 运营风险重申：C/E 双副本

活版本在 C 盘，E 盘是旧快照。改错地方 = 白改。本次巡检全程只读 C 盘。

---

## 四、演进路线（核心：本地即服务器，按数据归属分层）

总原则：**数据归属决定部署位置**。内容数据随网站走，工具/引擎数据永远留本机。按这个边界拆，上线就是加一个云端实例，不是重构。

### 阶段 0 — 本周可做，纯增量，无风险（合计约 100 行代码）

| # | 动作 | 收益 |
|---|---|---|
| 1 | `app.use(compression())` | nav 79KB→约 15KB，全站传输减 60~80% |
| 2 | `/assets/*` 加 `Cache-Control: immutable, max-age=31536000`（hashed 文件名安全） | 二次访问 JS/CSS 304 变 200-from-cache |
| 3 | 前端模块级 fetch 缓存：inflight 合并 + 30s TTL（`lib/api.ts` 一个 Map 搞定） | 首页 12 请求 → 8 次，`/meta` 4 连发 → 1 次 |
| 4 | PostDetail 的 react-markdown 改 `React.lazy` 动态 import | 主 bundle 约 -80KB |
| 5 | 请求日志中间件（method/path/status/ms，>200ms 标黄） | 本机的"仪表盘" |
| 6 | `data/work` 清理策略：保留最近 20 个任务 / 超 7 天 | 磁盘不再只增不减 |

### 阶段 1 — 数据层演进：引入 SQLite，Repository 抽象先行

**为什么是 SQLite（better-sqlite3）而不是 MySQL/Postgres/Mongo**：
- 单机零运维：没有第二个进程要管，没有连接池要调
- 单文件 = 现在的 JSON 体验不变：备份是 `cp`，搬迁是 `cp`，git 可管 schema
- 同步 API 与现有 `readJson/writeJson` 同步风格一致，路由层零 await 改动
- 未来上云：数据文件直接带走，或换 `pg` 实现同一 interface

**落地顺序（关键：先抽象后换实现，路由一行不动）**：
1. `store.ts` 定义 `interface DonateRepo { list/add/confirm/remove }`（每个模块一个 repo）
2. 现有 JSON 逻辑收进 `JsonDonateRepo`，行为不变
3. 新增 `SqliteDonateRepo`（better-sqlite3，WAL 模式）
4. 路由只依赖 interface——这正是既定的「后期换真实 DB，前端无感」路线，现在把缝留好
5. 写互斥：一个 20 行的内存 mutex 包住所有 repo 写方法，P0-2 随之解决

**同时做**：每日定时 `cp data/ → E:/WorkBuddy/backups/YYYY-MM-DD/`（SQLite 则用 `.backup`），本机当服务器，备份自动化是底线。

### 阶段 2 — 服务化拆分：为上线铺路（改的是挂载结构，不是重写）

按数据归属把 API 切成两族，Express 里已经是天然边界（各 router 独立文件）：

| 区域 | 内容 | 部署位置 |
|---|---|---|
| 展示区 | posts / tools / nav / meta / comments / friends / timeline / donate 的**墙** | 随网站上云 |
| 本地工具区 | toolkit（任务/子进程/文件浏览/媒体/字幕/简历/影视搜索）+ wedding | **永远留本机** |
| 中台区 | job-hunter 8080 | **永远留本机**（浏览器登录态） |

落地手段：
- `app.ts` 拆出 `mountPublicApi(app)` 与 `mountLocalApi(app)` 两份挂载清单，云端实例只挂前者
- 前端 `VITE_API_BASE`（云端内容）+ `VITE_LOCAL_API_BASE`（本机工具）双注入，工具类页面/AiWidget 打本地，内容类打云端
- 上线前过渡：本机 3001 用 Cloudflare Tunnel / frp 穿个洞给朋友看，买了服务器再按上表分流

### 阶段 3 — 工程化收尾

- QA 脚本（`E:/WorkBuddy/tools/qa-*.mjs`，现成 79 断言 donate + 全套）收编进 `portfolio/scripts/qa/`，`npm test` 一键跑——现在它们躺在项目外，换机器就丢
- 看门狗：`start-prod.bat` 已够用，加一个计划任务每 5 分钟探 `/api/health`，挂了自动重启（本机当服务器的本分）
- seed.ts 幂等性验证（重跑不产生重复种子）

---

## 五、给这个阶段的一句话建议

**不要引入服务注册中心、不要上微服务、不要现在换框架。** 你的站正确的下一个形态是：单文件 SQLite + 一层 Repository 抽象 + compression/缓存两个中间件 + 按数据归属拆成两族路由。这些全部是增量改动，任何一步停下都不亏——而它们恰好把「本机跑数据跑服务」和「将来上线」之间的断层填上了。

# 云上线优化方案

> 版本：v1.0 · 2026-10-18
> 起点状态：数据真实化已完成（假数据清零，见文末附录）
> 目标：把「本机跑的个人站」变成「一台云服务器上可长期运行的生产站」

---

## 0. 一句话结论

**这个站的工程质量已经达到「可以上线」的水平，缺的不是重构，是六件小事 + 一个决断。**
六件小事：git、.env、改密码、收紧 CORS、加压缩和缓存头、把 `dev-token` 后门焊死。
一个决断：**工具运行时（toolkit）不上云**——它能读写文件系统、拉 ffmpeg 子进程，这是全站唯一的真实安全风险，不该用「加强鉴权」来赌。

---

## 1. 现状盘点（实测，非估计）

| 维度 | 现状 | 上线影响 |
| --- | --- | --- |
| 版本控制 | **无 git 仓库** | 没有回滚点，改错一个字节只能靠记忆恢复；上线第一块基石 |
| 配置管理 | 无 `.env`，全部代码内默认值 | 密码/密钥要么硬编码进仓库，要么每次手改代码 |
| 鉴权 | admin/admin1234 默认口令；`requireAdmin` 兼容 `ADMIN_TOKEN` 默认值 `dev-token` | **任何人读到这里就能进后台**（P0） |
| CORS | `cors({ origin: true })` 全开 | 同源部署下无害，但一旦分域就是敞门 |
| 传输压缩 | 无 compression 中间件 | 首屏 JS 558KB 原样传输，gzip 后仅 167KB，**浪费 3.3 倍带宽** |
| 缓存头 | 无任何 Cache-Control | 老用户每次全量重下 5.6MB 的 dist |
| 代码分割 | 单包 558KB | 首屏就要下载全站代码（含后台、婚礼账本等路由） |
| 数据层 | JSON 文件 + read-modify-write 无锁 | 单人访问量下完全够用；并发写有丢更新风险 |
| 工具运行时 | fsRoots 默认 C/D/E 盘 + ffmpeg/Python 子进程 | **上云即把云服务器磁盘共享给公网**（P0，见 §3.5） |
| 首页请求 | 12 次 API 调用，其中 `/api/meta` ×4 | 每次全文件 parse 4 遍，可一处缓存解决 |
| 静态托管 | 单端口 3001，Express 托管 dist | 可行，但缺 Nginx 这一层（HTTPS/gzip/限流/缓存都在那一层） |

**已经做对的部分**（不要推翻，继续坚持）：

- `HOST` 默认 `127.0.0.1`，对外监听必须显式设 `0.0.0.0`——默认安全
- 原子写（tmp + rename）、统一 JSON 错误出口、`redirect:false`、静态 404 不回落 index.html
- 权限系统 scrypt + timingSafeEqual + 密码版本号废止旧 Token，设计是生产级的
- tsx 直跑 TypeScript，无编译步骤，部署链路极短

---

## 2. 风险分级总览

| 级别 | 项目 | 不做能不能上线 |
| --- | --- | --- |
| **P0 安全** | git、.env、改密码、焊死 dev-token、工具路由隔离 | 不能。上线即裸奔 |
| **P1 性能** | compression、缓存头、API 缓存、代码分割 | 能，但浪费 3 倍带宽且首屏慢 |
| **P2 架构** | SQLite、Repository 抽象、两族路由拆分 | 能。JSON 存储撑一个个人站三五年没有问题 |
| **P3 运营** | 备份、监控看门狗、部署脚本 | 能，但数据丢了哭都没地方 |

---

## 3. P0：上线前必须做的六件事

### 3.1 git init —— 第一块基石

```bash
cd portfolio
git init
```

`portfolio/.gitignore`（新建）：

```gitignore
node_modules/
dist/
apps/api/dist/
apps/web/dist/
.env
.env.*
!.env.example
apps/api/data/auth.json      # 含密码哈希与 HMAC 密钥，绝不入库
apps/api/data/work/          # 工具运行时的临时目录
shots/
*.log
```

> `data/` 里其余文件（posts/tools/meta…）**要**入库：它们就是内容本身，是版本历史的一部分。
> `auth.json` 例外：它同时持有密码哈希和 Token 签名密钥，入库等于把后门钥匙寄存在 GitHub。

第一次提交后，上线后的标准工作流变成：改代码 → 本地 `npm run build` 验证 → commit → 服务器 `git pull` → `pm2 restart`。**有回滚点，才有胆子迭代。**

### 3.2 配置外置 `.env`

好消息：代码里已经埋好了所有钩子，只是没有 `.env` 文件去触发它们。

`portfolio/.env.example`（入库，给文档用）：

```ini
# ---- 服务监听 ----
PORT=3001
# 上云时改为 0.0.0.0（此前默认 127.0.0.1 只收本机流量）
HOST=0.0.0.0

# ---- 安全（三行都必须在 .env 里覆盖，不覆盖就是已知后门） ----
# 首次创建管理员时使用的密码（仅 users 为空时生效）
AUTH_ADMIN_PW=换成你的强密码
# 旧接口兼容令牌：设成随机长串，让「dev-token」这个默认值失效
ADMIN_TOKEN=换成一串随机字符

# ---- 前端构建参数（build 时注入，改完要重新 build） ----
VITE_API_BASE=/api
VITE_CONSOLE_URL=https://console.你的域名   # 求职中台；留空则前台不展示该入口
```

`portfolio/.env`（真实值，**加入 .gitignore，永不上传**）。

配套小改（`apps/api/src/index.ts` 顶部，约 5 行）：启动时加载 `.env`。

```ts
// 最简做法：Node 20+ 支持 --env-file，或在 package.json 脚本里加
// "start": "tsx --env-file=../../.env src/index.ts"
```

> 不引 dotenv 依赖，用 tsx 自带的 `--env-file`。零新增依赖，符合这个项目的一贯风格。

### 3.3 改默认管理员密码

两种方式任选：

1. 删掉 `apps/api/data/auth.json` 再启动，设好 `AUTH_ADMIN_PW`，会用新密码重建管理员；
2. 已经登录了，直接在后台改密（改密逻辑已实现，会 +1 密码版本号并废止所有旧 Token）。

**验收标准**：`curl -X POST /api/auth/login` 用 `admin1234` 登录返回 401。

### 3.4 收紧 CORS

现在是同源部署（Express 同时托管前端），CORS 根本不该开。改 `apps/api/src/index.ts` 第 32 行：

```ts
// 同源部署：不开放跨域。将来前后端真要分域，把 'https://你的域名' 填进来，
// 也不要写 origin: true —— 那等于任何站点都能带着用户 Cookie 打你的接口。
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
```

### 3.5 工具运行时隔离 —— 全站唯一的真实安全风险

`/api/toolkit` 下的能力：浏览任意 fsRoots（默认 C/D/E 盘）下的目录、读文件、写文件、拉起 ffmpeg/Python 子进程、跑零依赖脚本。**这套东西设计给「只有你能访问的本机」，不是设计给公网的。**

三个选项，按推荐排序：

| 选项 | 做法 | 适合 |
| --- | --- | --- |
| **A. 不上云（推荐）** | 云服务器跑一个「展示版」进程，不挂 toolkitRouter；本机继续跑完整版 | 95% 的个人站。工具是自用的，公网用户要的是内容 |
| B. 独立子域 + 强鉴权 | toolkit 单独一个 Node 进程，绑 `tools.你的域名`，前面加 Nginx Basic Auth + IP 白名单，HOST 只绑内网 | 你真的要把工具开放给别人用 |
| C. 重写成沙箱 | 每个任务跑在独立容器/低权限用户里，路径锁死在 `/srv/toolkit-work` | 工程量以周计，个人站不值得 |

选 A 的具体做法（`apps/api/src/index.ts`）：

```ts
// 工具运行时默认不挂载；本机完整版设 ENABLE_TOOLKIT=1 开启
if (process.env.ENABLE_TOOLKIT === '1') {
  app.use('/api/toolkit', toolkitRouter);
} else {
  console.log('[api] toolkit 未挂载（生产展示模式）');
}
```

本机 `start.bat` 里给 API 窗口加 `set ENABLE_TOOLKIT=1`，行为不变；云端 `.env` 不设这一项，工具族路由直接不存在——**不是「鉴权拦在前面」，是「根本没有这条路」。**

同时建议云端 `.env` 不配 `VITE_CONSOLE_URL`（或指向本机穿透地址），求职中台的入口随之隐藏。中台要留在本机的原因很实际：它靠 Playwright 驱动你已登录的浏览器做真实投递，这是资产，不该搬到一台谁都能连的云服务器上。

### 3.6 焊死 `dev-token` 后门

`apps/api/src/auth.ts` 第 4 行：`const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token';`

这个默认值意味着：没设环境变量时，`x-admin-token: dev-token` 就是万能管理员钥匙。云端 `.env` 必须设 `ADMIN_TOKEN=<随机长串>`；更彻底的做法是承认这行兼容代码的历史使命已完成：

```ts
// 生产模式不再有默认令牌：未配置 ADMIN_TOKEN 时，只认 JWT 登录态
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
// ...
if (ADMIN_TOKEN && got === ADMIN_TOKEN) return next();
```

顺手全局搜一遍 `dev-token`、`admin1234`、`hello@example.com` 这些占位值，确认它们只存在于 `.env.example` 和文档里，不出现在任何会进仓库的文件中。

---

## 4. P1：性能优化（每项都是小改动、大收益）

### 4.1 compression —— 3.3 倍传输收益，10 行代码

```bash
npm -w @pf/api install compression
```

```ts
// apps/api/src/index.ts，放在 cors 之后
import compression from 'compression';
app.use(compression());
```

实测这个站的收益：首屏 JS 558KB → 167KB，CSS 61KB → 约 10KB。轻量云服务器带宽通常只有 3-5Mbps，这一项直接决定首屏是 1.5 秒还是 5 秒。

> 注意：如果前面还有 Nginx，`gzip on` 会再做一次。两层压缩不冲突（Nginx 对已压缩内容不再压），但通常让 Nginx 做就够了，Express 这层留着兜底（直连 3001 时也有）。

### 4.2 静态资源缓存头 —— 让老用户零重复下载

Vite 产物自带内容 hash（`index-BH6-dpoY.js`），这是天赐的不可变资源：

```ts
// apps/api/src/index.ts，替换现有 express.static 那一行
app.use(
  express.static(dist, {
    redirect: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // 带 hash 的产物：一年强缓存 + immutable
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // index.html / donate/*.png 等：每次协商缓存
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);
```

收益：二次访问只下载一个 index.html（约 3KB），其余全走本地缓存。

### 4.3 API 轻缓存 —— 干掉首页 4 连发

`/api/meta` 在一次首页加载里被调 4 次，而 meta.json + posts.json 可能几分钟才变一次。给纯读接口加 30 秒内存缓存：

```ts
// apps/api/src/index.ts
const cache = new Map<string, { at: number; data: unknown }>();
function cached(key: string, ttlMs: number, produce: () => unknown) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = produce();
  cache.set(key, { at: Date.now(), data });
  return data;
}

app.get('/api/meta', (_req, res) => {
  res.json(cached('meta', 30_000, () => { /* 原逻辑原样搬进来 */ }));
});
```

写操作（posts/tools/comments 的增删改）里 `cache.delete('meta')` 一下即可保持最终一致。30 秒的陈旧对读者无感，对服务器是 4 倍的读放大消失。

### 4.4 前端代码分割 —— 首屏只下载首屏

`apps/web/src/App.tsx`（或等价路由文件）里，把非首屏路由改成懒加载：

```tsx
import { lazy, Suspense } from 'react';

const Donate = lazy(() => import('./pages/Donate'));
const Guestbook = lazy(() => import('./pages/Guestbook'));
const Admin = lazy(() => import('./pages/Admin'));
// ……

<Suspense fallback={<div className="p-8 text-center opacity-60">加载中…</div>}>
  <Routes>{/* 原路由表 */}</Routes>
</Suspense>
```

558KB 的单包会裂成「首屏 ~200KB + 每路由一个 20-80KB 的分片」。配合 4.1 的 gzip，首屏传输量从 558KB 降到约 60KB。

> 注意：`apps/web` 的 tsconfig 就是 `tsconfig.json`，改完用
> `node ../../node_modules/typescript/bin/tsc --noEmit` 验证（这个项目里 `../node_modules/.bin/tsc` 是不可用的 shell 脚本，别踩）。

### 4.5 期望指标（优化后）

| 指标 | 现在 | 优化后 |
| --- | --- | --- |
| 首屏传输量 | ~630KB | ~70KB |
| 首页 API 请求 | 12 次（meta×4） | ≤6 次 |
| 二次访问传输量 | 5.6MB 全量 | ~10KB |
| API 响应头 | 无压缩无缓存 | gzip + ETag/缓存 |

---

## 5. P2：数据层演进路线（SQLite）

### 5.1 为什么是 SQLite，不是 MySQL

| 考量 | SQLite | MySQL |
| --- | --- | --- |
| 数据量 | 文章几十篇、评论几百条——**SQLite 的单文件优势区间** | 杀鸡用牛刀 |
| 运维 | 一个 `.db` 文件，备份 = 复制文件 | 一个常驻进程 + 账号权限 + 定期巡检 |
| 云服务器成本 | 2C2G 跑得动 | 同配置跑 MySQL 吃一半内存 |
| 并发 | 单写者 WAL 模式，读无限制——个人站绰绰有余 | 需要才会需要 |

### 5.2 演进路径（不推倒重来）

1. **Repository 抽象先行**：现在 `readJson/writeJson` 散落在各 route 文件里。先建 `src/repo/`，把每个实体（posts/tools/comments/donations/friends…）的读写收拢成函数：
   ```ts
   // src/repo/posts.ts
   export function listPublished(): Post[] { /* 内部先走 JSON */ }
   export function create(p: Post): void { /* 内部先走 JSON */ }
   ```
2. **引入 better-sqlite3**：把 repo 内部实现换成 SQL，建表语句随首次启动执行。route 文件一行不用改。
3. **数据搬家**：写个一次性脚本 `scripts/migrate-json-to-sqlite.ts`，读现有 JSON 灌进 SQLite，跑完原文件改名 `.bak` 留一个月。

```bash
npm -w @pf/api install better-sqlite3
```

> 为什么不是现在：JSON 存储在**当前数据量和个人站场景下没有实际问题**，read-modify-write 的并发风险被「管理员只有你一个人」这个事实抵消。先上线，等评论/赞赏真的多到 JSON 卡了（读一次全文件 parse 超过 50ms）再迁。**为想象中的规模提前架构，是这个阶段最贵的错误。**

---

## 6. 数据归属与两族路由

上线不是「全站搬上云」，而是按数据的安全属性分两族：

| 数据 / 能力 | 归属 | 理由 |
| --- | --- | --- |
| posts / tools / meta / timeline | **上云** | 纯内容，公网就是要看这些 |
| comments / donations / friends | **上云** | 读者产生真实数据的地方；赞赏还直接关系到钱 |
| license（源码授权 ¥1,999） | **上云** | 交易相关页面，必须在 |
| auth.json（账号 + Token 密钥） | 上云（新服务器重新生成） | 不要把本机的密码哈希和签名密钥带上去 |
| toolkit / 工具运行时 | **留本机** | 文件系统 + 子进程，见 §3.5 |
| 求职中台 job-hunter | **留本机** | 驱动已登录浏览器做真实投递；靠 `VITE_CONSOLE_URL` 控制入口显隐 |
| 婚礼账本 wedding | 二选一 | 私密数据，建议留本机或单独鉴权 |

对应的路由拆分（`apps/api/src/index.ts`）：

```ts
// 展示族：云端挂载
app.use('/api', postsRouter, toolsRouter, extraRouter, authRouter, aiRouter, weddingRouter);

// 工具族：仅本机完整版挂载（ENABLE_TOOLKIT=1）
if (process.env.ENABLE_TOOLKIT === '1') {
  app.use('/api/toolkit', toolkitRouter);
}
```

前端双 base 已经预留好了（`src/lib/api.ts`）：`VITE_API_BASE` 默认 `/api` 同源；中台入口走 `VITE_CONSOLE_URL`。**不需要为上线改一行前端代码**，只要云端 build 时把 `.env` 配对。

---

## 7. 部署形态

### 7.1 买什么服务器

| 项 | 建议 | 说明 |
| --- | --- | --- |
| 规格 | 2 核 2G / 3Mbps | 这个站的实测负载：Express 单进程 + 静态文件。2G 跑 Node + Nginx 宽裕 |
| 系统 | Ubuntu 22.04 LTS 或 腾讯云 OpenCloudOS | 教程多，PM2/Nginx 一键装 |
| 厂商 | 腾讯云 / 阿里云轻量应用服务器 | 新用户首年通常在 ¥100-200，含备案支持 |
| 地域 | 国内（需备案）或 香港/海外（免备案，延迟 +50ms） | 见 7.2 |

### 7.2 备案：国内服务器的必答题

- 服务器在国内 → **必须备案**才能把域名解析到 80/443。流程：厂商提交初审 → 短信核验 → 通管局审核，**整体 1-3 周**，期间网站不能开。
- 嫌等就用香港节点免备案先上线，流量起来再迁国内；域名实名认证和 ICP 备案可以并行准备。
- 域名本身（.com / .cn）实名认证 1-3 天，和备案是两件事，先做。

### 7.3 Nginx —— 上线的主干道

```nginx
# /etc/nginx/conf.d/portfolio.conf
server {
    listen 443 ssl http2;
    server_name 你的域名;

    ssl_certificate     /etc/nginx/ssl/你的域名.pem;      # 厂商证书或 certbot 签发
    ssl_certificate_key /etc/nginx/ssl/你的域名.key;

    # gzip 在这一层做（Express 的 compression 留着兜底直连场景）
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # 带 hash 的静态产物：交给 Nginx 直接发，不经过 Node
    location /assets/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
    }

    # 静态图片（赞赏码等）：缓存但不 immutable（内容会换）
    location ~* \.(png|jpg|jpeg|webp|svg|ico)$ {
        proxy_pass http://127.0.0.1:3001;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name 你的域名;
    return 301 https://$host$request_uri;   # 全站 HTTPS
}
```

### 7.4 PM2 —— 进程守护

```bash
npm install -g pm2
cd /srv/portfolio
pm2 start "npm run start" --name portfolio
pm2 save
pm2 startup   # 按提示执行，开机自启
```

PM2 自带的三件事正好是这个站需要的：崩了自动重启、日志滚动、`pm2 monit` 看内存/CPU。

### 7.5 部署与回滚（git 到位后的标准流）

服务器上：

```bash
cd /srv/portfolio
git pull
npm ci                          # 按 lock 文件精确还原依赖
npm run build                   # 前端构建
pm2 restart portfolio           # API 是 tsx 直跑，重启即生效
```

回滚 = `git log` 找到上一个好的 commit → `git reset --hard <hash>` → 重复上面三步。**五分钟内恢复，这就是 git 的意义。**

日常发布脚本化：`deploy.sh` 四行，SSH 上去跑，或者 GitHub Actions（私有仓库免费）。

---

## 8. 备份与监控

### 8.1 备份：个人站的三二一简化版

要备份的只有两个东西：

1. **代码** → GitHub 私有仓库（git push 就是备份）
2. **数据** → `apps/api/data/`（SQLite 迁移后就是那一个 `.db` 文件）

服务器 cron，每天凌晨打包数据目录，保留 14 天：

```bash
# crontab -e
0 3 * * * tar -czf /srv/backups/data-$(date +\%F).tar.gz -C /srv/portfolio/apps/api data && find /srv/backups -name 'data-*.tar.gz' -mtime +14 -delete
```

再叠一层：把每天的打包文件 scp 到本机（或对象存储 COS/OSS，一年几十块钱）。**服务器厂商的快照不能替代你自己的备份**——账号出问题时快照和你一起锁死。

### 8.2 监控看门狗

最小可用组合：

- PM2：进程崩溃自动重启（第一道）
- cron 健康检查，每 5 分钟打一次 `/api/health`，连失败两次发通知：
  ```bash
  */5 * * * * curl -fs http://127.0.0.1:3001/api/health > /dev/null || echo "portfolio down" | mail -s "ALERT" 你的邮箱
  ```
- 外网拨测（可选）：UptimeRobot 免费档，从外部探测域名可达性——服务器整个宕机时，站内的 cron 是喊不出声的。

---

## 9. 分阶段路线图

| 阶段 | 内容 | 验收标准 | 预估 |
| --- | --- | --- | --- |
| **阶段 0** | git init + .gitignore + 首次提交 | `git log` 有记录，auth.json 不在仓库里 | 半小时 |
| **阶段 1** | §3 全部 P0 项 | admin1234 登录失败；dev-token 失效；云端部署物里没有 toolkit 路由 | 半天 |
| **阶段 2** | §4 全部 P1 项 | 首屏传输量 < 100KB；首页 API ≤ 6 次 | 半天 |
| **阶段 3** | 域名 + 备案 + 服务器 + Nginx + PM2 + HTTPS | `https://你的域名` 全站可访问，HTTP 跳转 HTTPS | 备案 1-3 周（并行），部署半天 |
| **阶段 4** | 备份 cron + 健康检查 +（可选）SQLite 迁移 | 演练一次「删数据文件 → 从备份恢复」成功 | 半天 |

**阶段 0-2 在买服务器之前就能全部做完。** 买服务器应该是最后一步，不是第一步——本机 3001 跑着的这个站，先按生产标准收拾干净，上云当天只是「换个地方 `git pull`」。

---

## 10. 上线前检查清单

```
安全
- [ ] git init 完成，.gitignore 含 auth.json / .env / dist
- [ ] .env 配置：AUTH_ADMIN_PW / ADMIN_TOKEN / HOST=0.0.0.0
- [ ] admin1234 无法登录（新密码已生效）
- [ ] x-admin-token: dev-token 返回 401
- [ ] 云端构建物不含 toolkitRouter（ENABLE_TOOLKIT 未设）
- [ ] CORS 不再是 origin: true
- [ ] data/ 目录里没有遗留的假数据（当前已清零）

性能
- [ ] compression 生效（curl -H 'Accept-Encoding: gzip' 看 Content-Encoding）
- [ ] /assets/* 响应头带 immutable
- [ ] index.html 是 no-cache
- [ ] 非首屏路由已懒加载

部署
- [ ] 域名实名认证通过；备案提交（国内）
- [ ] Nginx 443 + 80 跳转 + gzip
- [ ] PM2 startup 已执行，重启服务器后站自己起来
- [ ] deploy.sh / 部署文档写好，回滚步骤演练过一次
- [ ] 数据备份 cron 在跑，且真的去 /srv/backups 看过文件

内容
- [ ] 后台能登录、能发文章（云端完整走一遍发布流程）
- [ ] 赞赏页扫码 → 认领 → 后台确认 → 上墙，全链路走一遍（这是钱相关的功能）
- [ ] 源码授权页（¥1,999）展示正常
- [ ] RSS /feed.xml 可访问
- [ ] 移动端三个空态页（留言/友链/赞赏）渲染正常
```

---

## 附录 A：数据真实化清单（本方案的前置状态，2026-10-18 完成）

**已清空为 `[]`（原内容全是演示假数据或 QA 测试污染）：**

| 文件 | 清理前 | 说明 |
| --- | --- | --- |
| `comments.json` | 6 条 | 3 条 QA 测试污染（含 `<script>alert(1)</script>` 注入测试残留）+ 3 条演示评论 |
| `donations.json` | 13 条 | 全部为赞赏页 QA 构造的测试赞赏 |
| `friends.json` | 5 条 | 演示友链 |

**根因已修**（`apps/api/src/seed.ts`）：删除 `SEED_FRIENDS`/`SEED_COMMENTS` 常量，`ensureSeed()` 对这三个文件缺失时只写 `[]`；`--force` 重置列表加入 donations.json。**假数据不会死灰复燃。**

**保留的真实数据：**

| 文件 | 数量 | 性质 |
| --- | --- | --- |
| posts.json | 8 篇 | 真实技术文章（求职中台复盘、牛客爬虫、分页、主题、Node 服务、AI 路线、插件、去水印） |
| tools.json | 23 个 | 真实工具与项目 |
| nav.json | 362 条 / 10 类 | 真实导航库 |
| timeline.json | 3 条 | 真实站点大事记 |
| question_bank.json | 2 个批次 | 真实同步的测试批次；`scripts/nowcoder_sync.cjs` 在，可随时全量重扫 461 题 |
| meta / tool-config / license / donate / wedding / auth | 配置 | 真实配置（donate.json 的二维码指向真实收款码图片） |

**清理前全量备份**：`E:/WorkBuddy/backups/data-before-real-clean-2026-10-18/`（15 个文件）。误杀了哪个，从那里捞。

**空态已验证**（浏览器实测，0 报错）：留言板「还没有留言，来抢沙发。」/ 友链「还没有友链。」/ 赞赏「还没有人赞赏，你可以是第一个。」，赞赏页认领流按钮按预期禁用、二维码占位正常。

---

## 附录 B：本文涉及的文件改动索引

| 文件 | 改动 | 阶段 |
| --- | --- | --- |
| `portfolio/.gitignore` | 新建 | 0 |
| `portfolio/.env` / `.env.example` | 新建 | 1 |
| `apps/api/package.json` | `start` 脚本加 `--env-file`；装 compression | 1 / 2 |
| `apps/api/src/index.ts` | cors 收紧、compression、缓存头、meta 缓存、toolkit 条件挂载 | 1 / 2 |
| `apps/api/src/auth.ts` | ADMIN_TOKEN 无默认值 | 1 |
| `apps/web/src/App.tsx`（或等价路由文件） | 路由懒加载 | 2 |
| `apps/api/src/repo/*.ts` | 新建（SQLite 阶段） | 4（可选） |

# 博客站测试报告（QA Round 1）

测试时间：2026-10-17
测试范围：`portfolio`（React 前端 + Express 后端，单端口 3001 本地服务）
测试方式：接口自动化 105 项断言 + 边界/并发 15 项 + 安全专项 8 项 + 真实浏览器逐页点击（Kimi 扩展驱动本机 Chrome）

---

## 一、总体结果

| 层级 | 用例数 | 通过 | 结论 |
|---|---|---|---|
| 后端接口（功能 + 鉴权 + 边界） | 105 | 105 | 全通过 |
| 边界与并发 | 15 | 15 | 全通过 |
| 安全专项 | 8 | 8 | 全通过 |
| 浏览器页面巡检 | 15 条路由 | 15 | 无运行时错误 |
| 交互流程 | 22 项 | 22 | 全通过 |

发现并修复缺陷 **9 个**，其中高危 2 个。

---

## 二、缺陷清单（均已修复并回归）

### P0-1 无鉴权即可下载应用密钥文件 ⚠️ 高危

`GET /api/toolkit/files?path=...` 与 `/raw` 只校验「是否在允许的根目录内」，而默认根目录包含整盘根（`C:\`、`D:\`、`E:\`、用户目录、进程工作目录）。因此**任何人**都能直接下载：

- `apps/api/data/auth.json` → JWT 签名密钥 + 管理员密码哈希 + 盐
- `apps/api/data/tool-config.json` → 大模型 apiKey

实测：`files -> 200 application/json`，返回内容含 `"salt"`、`"secret"`。

**修复**：`services/toolkit.ts` 新增 `isSensitivePath()` 黑名单，在根目录校验之前先拦截：
- 应用 `data/` 目录整体禁止（仅放行产物目录 `data/work/`）
- `C:\Windows`、`Program Files`、`ProgramData`、`Recovery`、`Boot`、`PerfLogs`
- 任意盘的 `$Recycle.Bin`、`System Volume Information`
- `.git`、`.ssh`、`*.pem|key|pfx|p12`、`id_rsa`、`.env*`

回归：`files/raw` 读 `auth.json`、`tool-config.json` 均 404；正常文件（沙箱视频）仍 200，未误伤。

### P0-2 服务监听 0.0.0.0，同局域网可访问工具运行时 ⚠️ 高危

`app.listen(PORT)` 绑定全部网卡，而工具接口无鉴权、可读写本机文件、可拉起 ffmpeg 子进程——同网段任何设备都能操作你的磁盘。

**修复**：默认 `HOST=127.0.0.1`，需要对外时显式设 `HOST=0.0.0.0` 并在启动日志打印告警。

回归：`netstat` 已从 `0.0.0.0:3001` 变为 `127.0.0.1:3001`。

### P1-1 已登录但非管理员返回 401（应为 403）

`requireAdmin` 对 role=user 的合法 Token 返回 401，前端会误判为「未登录」并弹登录框，用户反复登录仍失败。

**修复**：Token 合法但角色不足 → 403；无 Token / 非法 Token → 401。

### P1-2 评论回复可挂到不存在的父评论

`parentId` 未校验，可提交指向不存在评论、甚至其它文章评论的回复，前端渲染成孤儿节点（父不在列表里就整条消失）。

**修复**：父评论不存在 → 400 `parent_not_found`；跨页面（slug 不同）→ 400 `parent_mismatch`。前端同时把「父已被删除」的回复降级为一级评论展示，避免内容凭空消失。

### P1-3 改密后旧 Token 仍然有效

Token 为无状态 JWT，改密码后其它设备上的旧 Token 仍可用 30 天。

**修复**：用户增加密码版本号 `pv`，签发时写入 Token，校验时比对；改密 `pv+1` → 旧 Token 立即失效。角色也改为以库为准，防止旧 Token 携带过期角色权限。

回归：改密后旧 Token 访问 `/api/auth/me` 返回 401，新密码可正常登录。

> 首版用 `iat` 与改密时间比较，因 JWT 时间戳只有秒级精度，同一秒内会漏判——改为版本号后精确生效。

### P1-4 登录接口无暴力破解防护

可无限次尝试密码。

**修复**：按 `IP + 用户名` 计数，10 分钟内失败 8 次 → 429；成功一次即清零，避免误锁正常用户。

回归：连续 9 次错误密码 → `401×8 + 429`；同 IP 下 admin 不受影响（按用户名隔离）。

### P2-1 请求体超限 / JSON 语法错误返回 HTML 错误页

Express 默认错误处理返回 HTML，前端 `fetch` 解析 JSON 失败，只能显示笼统错误。

**修复**：新增统一错误出口，400/413/500 全部返回 JSON（`{error, hint}`）。

回归：3MB 请求体 → `413 application/json {"error":"payload_too_large"}`；畸形 JSON → `400 {"error":"bad_request"}`。

### P2-2 Token 失效后前端仍显示「已登录」

会话只存在 `localStorage`，从不校验。服务端作废 Token 后，界面仍显示管理员身份，但所有写操作都失败且无明显提示。

**修复**：
- `lib/api.ts`：带 Token 却收到 401（且不是登录接口）→ 自动 `logout()`，界面回到未登录态
- `UserMenu`：挂载时调 `/auth/me` 核对会话，失效则清理

回归：注入伪造 Token 后刷新页面 → 本地会话被清除、右上角恢复「登录」。

### P2-3 注册限流把校验失败也算进配额

重名、密码太短这类本来就不会创建账号的失败尝试也消耗每小时 5 个配额——用户连打错几次就要等一小时（本地开发连跑几轮测试同样会被锁）。

**修复**：改为**只统计成功创建**的账号；已触发限流时仍优先返回 429。

回归：连续 6 次合法注册 → `201×4 + 429×2`（含前序测试已占 1 个配额，上限 5 生效）。

---

## 三、覆盖情况

### 后端（105 项）

- 文章：列表/分页（页码越界、size 上下限、非法参数）、分类/标签/关键词筛选、排序、详情、404
- 写操作与鉴权：匿名 401、伪造 Token 401、篡改签名 401、普通用户 403、管理员 201、PATCH/DELETE、删除后 404
- 注册登录：注册成功/重名/弱密码/用户名过短、错误密码 401、空 body 400、`/me`
- 评论：匿名 401、空内容 400、昵称强制取 Token（防伪造）、楼中楼、父评论校验
- 婚礼礼账：未登录 401、缺字段 400、负数金额 400、称谓/实物礼落库、统计、筛选、改删、清空需 confirm
- 赞赏：配置不下发密钥、认领校验（非法/负数金额）、待确认需管理员、确认上墙、删除
- 授权：返回配置、不含敏感字段
- AI：空问题 400、命中来源、无关问题有兜底、超长问题不崩
- 工具运行时：env（ffmpeg ok）、路径守卫（系统目录/路径穿越/应用 data 目录）、任务类型校验、任务不存在 404、配置接口鉴权
- 基础设施：RSS 真 XML 且含条目、SPA 回退、未知 API 返回 JSON 404

### 边界与并发（15 项）

畸形 JSON、超大 body、错误 Content-Type、Emoji/特殊字符、注入式字符串、**并发 20 次写入无丢失**、重复 slug（自动追加 id 后缀）、分页一致性、礼账统计精度、删除不存在资源、用户列表不泄露哈希。

### 浏览器（真实 Chrome）

- 15 条路由逐页加载，注入全局 `error` / `unhandledrejection` / `console.error` 钩子监听，除赞赏页两张未上传的二维码图 404（已有占位兜底）外**无运行时错误**
- 移动端 375×812：首页/列表/详情/工具/礼账/赞赏/留言板**无横向溢出**（代码块在自身容器内滚动）
- 交互实测：首页→文章→目录锚点跳转、评论登录墙、登录（含 Chrome 自动填充场景）、发表评论、楼中楼回复、后台新建文章并落库、工具分类筛选、关键词过滤、礼账记账+成册渲染、赞赏选金额、AI 助手问答、顶部搜索（输入→出结果→点击跳转）、404 页、暗色模式切换与持久化

---

## 四、遗留与非缺陷说明

| 项 | 说明 |
|---|---|
| 赞赏/授权二维码 404 | 图片尚未上传，页面已用 `onError` 显示占位与放置路径，属预期降级 |
| AI 助手为检索模式 | 未配置 LLM apiKey，配置后自动切换为总结式回答 |
| 注册限流为进程内存 | 重启清零；单机本地部署可接受，上云需换 Redis/DB |
| 评论无删除接口 | 目前仅管理员可通过数据文件清理，未开放用户自助删除 |
| 大文件请求上限 2MB | Markdown 文章足够；如需传图应走文件上传接口而非 JSON |

---

## 五、回归方式

```bash
# 接口全量（105 项）
node E:\WorkBuddy\tools\qa-api-test.mjs

# 边界与并发
node E:\WorkBuddy\tools\qa-edge.mjs

# 安全专项（登录限流 / 改密失效）
node E:\WorkBuddy\tools\qa-security.mjs

# 浏览器巡检（需 Kimi 扩展 daemon 在线）
node E:\WorkBuddy\tools\qa-browser.mjs
```

测试脚本会自行清理大部分数据；`qa-api-test.mjs` 产生的评论可用 `node qa-cleanup.mjs` 清理。

---

## 六、Round 2：上传二维码时暴露的 2 个缺陷

上传赞赏/咨询二维码后发现图片"放上去了但页面不显示"，顺带挖出两个真问题。

### P1 静态资源缺失被 SPA 兜底成 index.html（200）

`app.get('*')` 对任何非 `/api/` 路径都返回 `index.html`，包括 `/donate/wechat.png` 这类**还没上传的图片**。后果：

1. 浏览器拿到 `200 text/html` 而不是 404，前端 `onError` 之外的分支判断全部失真；
2. Service Worker 的资源缓存只判断"有没有命中"，于是把这份 HTML **当成图片缓存**下来；
3. 真图上线后，SW 仍返回缓存里的 HTML → 解码失败 → 页面继续显示占位，只能手动清缓存。

**修复**：
- 后端：带文件扩展名的路径不再回落 SPA，直接 `404 text/plain`（`index.ts`）
- Service Worker：`VERSION` 升到 `v2`（激活时清掉旧缓存），且**只缓存 `res.ok` 的真响应**（`public/sw.js`）

### P2 `public/donate/` 目录导致 `/donate` 路由 301

静态目录与前端路由同名时，`express.static` 默认把 `/donate` 重定向到 `/donate/`，导航多一跳、分享链接也会变形。

**修复**：`express.static(dist, { redirect: false })`。

### 顺带优化

- 三张二维码原图是 750×1000 的宣传海报，直接放进 220px 的框里二维码本体只有约 60px，手机扫不出来。已按「墨迹包围盒」自动裁到二维码本体 + 10% 静区，输出正方形 PNG（`wechat.png` 415²、`alipay.png` 900²、`contact-wechat.png` 717²）。
- 授权区块的咨询码从 112px 放大到 176px，扫码更稳。

复现脚本：`node E:/WorkBuddy/tools/qa-qr.mjs`。当前全站 **0 运行时错误**。

---

## 七、Round 3：求职中台多用户数据分片 + 全站回归

### 实现：job-hunter 按账号隔离数据（多用户化第一步）

新增 `job-hunter/agent/userdata.js` 作为**唯一的数据路径入口**，`server.js` / `auto_apply.js` / `job_sync.js` / `greeting.js` 全部改走它：

- 用法：`node server.js --user alice`、`node agent/auto_apply.js --user alice --dry-run`，或 `JOB_USER=alice`
- **个人数据**（按 user 分片到 `data/users/<user>/`）：`store.json`、`job_pool.json`、`auto_apply_log.json`、`posts.json`、`resume_profile.json`
- **共享数据**（仍在 `data/`）：`question_bank.json`（题库内容）、`library.json`（企业库，抓取成本高）
- **用户名清洗**：只留字母/数字/下划线/中文/连字符，`../../evil` → `evil`，杜绝路径穿越
- **一次性迁移**：仅 `default` 用户继承 `data/` 根下的老文件；**新建用户必须是空库**，否则会把上一个人的简历和投递记录带过去
- `/api/state` 增加 `user` 与 `dataDir` 字段，前端与自检可确认当前服务的是谁的数据

### 测试（新建 `qa-jobhunter-multi.mjs`，14/14 通过）

同时起 alice(8081) 与 bob(8082) 两个实例：

| 用例 | 结果 |
|---|---|
| 各实例 `/api/state` 报告自己的 user | alice / bob ✓ |
| alice 建岗位，自己可见 | ✓ |
| **bob 看不到 alice 的岗位** | ✓ 隔离生效 |
| 反向：alice 看不到 bob 的 | ✓ |
| 数据文件落在各自目录 | ✓ |
| 用户名清洗挡住 `../../evil` | ✓ |
| 默认用户迁移后数据一致 | 40 岗位 / 7 投递，与老文件**逐字节相同** ✓ |

### 全站回归结果

| 套件 | 结果 |
|---|---|
| 接口全量 | **105 / 105** |
| 边界与并发 | **15 / 15** |
| 安全专项 | **8 / 8** |
| 导航站 + 开发者工具箱 | 全通过（362 卡片、9 个 tab、Base64/正则/颜色/UUID/SHA-256 实时出结果） |
| 二维码 | 5 / 5（三张图渲染、切换、尺寸 ≥160px） |
| 页面巡检（17 条路由） | 无 BAD（仅 2 个预期 THIN：工具空态、后台需登录） |
| 运行时错误 | **0 条** |
| 移动端 375×812 | 无横向溢出 |

**回归中修正的测试缺陷**（断言写错，非产品问题）：
- 超限用例原来只发 300KB（未达 2MB 上限），改为 3MB 才真正触发 413
- slug 重复用例原来期待"拒绝或覆盖"，实际策略是**自动追加 `-<id后4位>` 后缀**，断言改为验证新 slug 可访问

**数据清理**：测试账号、测试文章/评论/礼账/赞赏已全部清除，最终 8 篇文章 / 3 条留言 / 1 个账号(admin) / 礼账空 / 导航 362 条。

---

## 八、Round 4：样式收尾 + 工具集市信息架构改造（1+2 步）

### 样式审计收尾

平板 768（浅色/深色，各 16 条路由）复测 **0 问题**，修复生效；复跑桌面/移动/深色三档确认无副作用。
四档（1440 / 768 / 375 × 浅色深色）**全部 0 严重问题**。

### 工具集市 vs 网址导航：诊断与改造

**诊断结论**：不是功能重叠，是**分类维度错配**。

| 模块 | 构成 | 问题 |
|---|---|---|
| `/tools` 24 条 | 真工具 13 + 小游戏 3 + 我的项目外链 7 + 需扩展环境 1 | 四类混排，点击行为四种，预期不一致 |
| `/nav` 362 条 | 纯外链，其中「在线工具」56 | 与本地真工具功能同构，用户不知该选哪个 |

**不推荐合并**：比例 362:13，合并会让本地工具（最值钱的资产）被外链淹没，且导航有独立 SEO 价值。
**采用**：分层 + 双向指路（本次只做前两步）。

### 落地内容

1. **移除自引用**：删 `tools.json` 的 `nav-directory`（`to:"/nav"`），同步删 `meta.json` 的 `toolCats` 中"导航目录"。24 → 23 条。备份 `*.json.bak`。
2. **卖点徽标**：`registry.ts` 新增 `edge` 字段 + `toolEdge()`；`ToolCard` 在描述下方渲染绿 chip。13 个真工具带徽标，**小游戏不带**（不涉及数据处理）。

### 测试（新建 `qa-tools-ia.mjs`，8/8）

23 张卡 / 无导航目录分类 / 页面无"网址导航"卡片 / 徽标 13 个 / 小游戏 0 徽标 / 分类筛选后徽标跟随 / 0 运行时错误。

**回归**：样式三档 0 问题、全站 0 运行时错误、移动端无横向溢出。

**修正的测试缺陷**：分类筛选断言偶发 FAIL（点击后计数仍是 23）。诊断确认功能正常，是首次加载时序——改为**轮询等待目标值**（最多 9s）而非固定 sleep 后稳定。

---

## 九、Round 5：导航站点 favicon 本地化

### 产品判断

用户提议"去网上找一一对应的 logo"。结论：**logo 该加，但不能手工找**——346 个唯一域名手工不可持续，且后续加链接永远不同步。同时排除**运行时热链第三方 favicon 服务**：每次页面加载向服务商发 346 个请求，泄露收藏夹与访客身份，且服务挂了全站碎图（实测 Google s2 / DuckDuckGo 在本机全部超时，证明该路对中国访客本就不通）。

采用：**一次性批量抓取 + 本地托管 + 失败回退首字母头像**。

### 实现

`E:/WorkBuddy/tools/fetch-nav-logos.mjs`（并发 8、超时 10s、可中断续跑、`--upgrade` 增量升级）：

抓取顺序：**先读首页 HTML 解析 `<link rel="icon">`**，再退回猜路径。
关键发现：现代站点大多不在根路径放 favicon（`ant.design/favicon.ico`、`socket.io/favicon.ico` 均 404）——只猜路径覆盖率 **54.9%**，加 HTML 解析后 **72.5%**。

- 产物 `apps/web/public/logos/`（251 文件 / 4.2MB），Vite 构建自动进 dist
- `nav.json` 条目新增 `logo` 字段；API `/nav` 为 `readJson` 原样返回，无字段白名单，可透传
- `Nav.tsx`：logo 盖在原有首字母头像之上，`onError` 移除自身露出头像（回退零成本）
- `imageSize()` 解析尺寸，候选中取最大；16px 图标放进 32px 卡位会发虚，`--upgrade` 将 16px 从 29 个降到 18 个

### 结果与验证（`qa-nav-logos.mjs`）

| 项 | 值 |
|---|---|
| 有 logo 条目 | **263 / 362**（72.5%） |
| 首字母回退 | 99 |
| 加载成功 / 失败 | **263 / 0**（`naturalWidth>0`） |
| 样式审计四档 | 0 问题 |

未覆盖的 95 个域名原因：SPA 站点（head 由 JS 渲染）、代理 403/超时（stackoverflow、instagram）、站点本身无可用图标。**属于网络环境限制，非脚本缺陷。**

### 踩坑记录

- **懒加载在自动化浏览器里不触发**：Kimi 浏览器不算交叉区、`scrollBy` 无效（scrollY 恒 0），263 张 lazy 图全部 `complete=false`，酷似"全没加载"。验证需先 `loading='eager'`。属测试环境限制。
- 备份 `apps/api/data/nav.json.bak-logos`。

---

# Round 6 · 全站布局美化与多分辨率兼容（高级 UI 工程师视角）

## 背景

用户要求："模拟高级 UI 工程师，对网站布局进行美化，包括各个页面，设计怎么合理，还要解决设备分辨率兼容问题"。
先做度量再动手（任务 #78 审计），问题清单：

| 问题 | 度量数据 |
|---|---|
| 页面标题 4 种竞争写法 | `text-3xl md:text-4xl`×7 / `text-[27px] md:text-4xl`×3 / `text-[26px] md:text-[34px]`×1 / `text-2xl`×2；ToolRunner 仅 20px（层级 bug） |
| 页面顶部 padding 4 种 | `pt-10`×10 / `pt-16`×6 / `pt-12`×1 / `pt-24`×1 |
| 过小文字 | 源码 55×`text-[10px]` + 16×`text-[10.5px]` + 22×`text-[11.5px]`；`/nav` 页 364 处 <11px |
| 触控目标 <24px | `/` 32、`/posts` 31、`/nav` 12（标签云 chip 仅 21px 高） |
| `.card-hover` 阴影 | 硬编码 `rgba(0,0,0,0.7)`，浅色主题下过重 |
| 无障碍 | 无 `:focus-visible` 焦点环、无 `prefers-reduced-motion`、触屏设备 hover 抬升会"粘住" |

## 改动（`apps/web/src/index.css` 设计系统 + 全页面）

**1. 字号阶梯（一套变量管全站）**
- 新增 `.h1`（27px → 34px@md → 36px@xl，`text-wrap: balance`）、`.h2`、`.h3`、`.lede`
- 12 个页面的 h1 全部收敛到 `.h1`；8 个页面导语收敛到 `.lede`；ToolRunner 20px → `text-2xl`
- Admin/Console 类仪表盘标题、Home hero（34→54px 展示型）、404 插画副题**刻意保留**——不是所有大都标题都要一样大

**2. 触控目标（可点击 vs 装饰，区别对待）**
- `!py-*` 覆盖会击败媒体查询（`!important` 对 `!important` 看特异性），**从源码剥除**可点击 chip 的 `!py-*`（侧栏链接、礼账本选项、弹窗关闭钮等 20 处）；装饰性徽标（置顶/HOT/可用）保持紧凑
- 移动端 `.chip` 纵向 padding 提到 6px（≥30px 高）
- 页脚/侧栏文字链（17px 高）移动端撑到 ≥27px：`footer li a` 转 `inline-block` + padding；侧栏链接只加 padding（不动 display，避免覆盖热文链的 flex 布局——级联陷阱）
- 留言板「回复」「取消」按钮 `inline-block px-1.5 py-1`（22x25 → 34x25）

**3. 主题与阴影**
- 新增 `--shadow-hover` 令牌（深浅两套），`.card-hover:hover` 改用它，浅色主题不再黑影重重
- `(hover: none)` 媒体查询禁用触屏抬升；`prefers-reduced-motion` 全局降级；`:focus-visible` 统一焦点环

**4. 其他**
- `.wrap` 在 ≥1536px 放宽到 1200px（宽屏正文行宽）
- 字号归一化：10px/10.5px → 11px，11.5px → 12px（93 处 / 29 文件，机械替换后 0 残留）

## 验证（qa-layout-metrics / qa-errors / qa-tools-ia / qa-style 四套件）

| 指标 | 改前 | 改后 |
|---|---|---|
| 横向溢出（5 档宽度 × 10 路由） | 0 | **0** |
| <11px 文字 | /nav 364、/ 99、/tools 92、/posts 64 | **全站 0** |
| h1 字号 | 4 种写法 20~36px 混乱 | 27/34/36px 三档统一 |
| 移动端触控 <24px | / 32、/posts 31、/nav 12 | **9/10 页归零**（guestbook 3 个已修） |
| 运行时错误（13 路由） | 0 | **0** |
| 样式严重问题（三档） | 0 | **0** |
| 工具 IA 断言 | 8/8 | **8/8** |

构建：`vite build` 5.4~6.6s 通过；`tsc --noEmit` 0 错误。视觉验收截图 10 张（桌面/移动 × 浅色/深色）在 `E:/WorkBuddy/shots/`。

## 踩坑记录（重要）

- **C/E 双副本陷阱**：项目记忆称"工作区已迁移 E 盘、经目录联接访问"，实际**没有任何目录联接**，C/E 是两份独立代码。3001 端口服务跑的是 **C 盘**（进程命令行证据），今天的 nav.json/tools.json 更新也全在 C 盘；E 盘是旧快照（无 nav.json、缺 5 个页面）。**首批 index.css 改动误落 E 盘，已还原 E、改落到 C。** 迁移任务 #34 实际未完成。
- Git Bash 的 MSYS 会把 `"/"` 命令行参数转成 Windows 路径，拼出非法 URL 导致桥接导航失败——脚本路由要写死在文件里，不走 argv。
- 桥接同名 session 重复建标签组会报 "Cannot navigate to invalid URL"——换 session 名即可。
- CSS 级联：无层次样式对 normal 声明赢过 layered，但对 important 声明会输给 layered——所以 `!py-*` 不能靠媒体Query覆盖，必须改源码。

---

# Round 7 · 头部导航 + 页脚美化（回应用户截图反馈）

用户贴出头部特写与页脚两张截图问"这两块是不是不太美观"。诊断出 7 个问题并全部修复。

## 问题清单

**头部（4）**
1. 品牌名在窄屏被挤压成词中断行（"一只狡猾的狐/狸"）——`tracking-wide` 撑宽 + 无 nowrap
2. 🔍 是 emoji，Windows 渲染成彩色渐变放大镜，与单色 ☾/☰ 风格割裂
3. 按钮高度不齐：汉堡移动端 44px、其余 36px；登录钮 36px 但隐藏逻辑形同虚设（`.btn` 自带 inline-flex，`sm:inline-flex` 是空操作）
4. 工具栏 gap-2 偏大，四个圆角方块显得零散

**页脚（3）**
1. 右半大量留白：内容栏 8 条 vs 模块栏 4 条，三栏高度失衡
2. 所有文字同一个 muted 灰，栏目标题与链接无层级
3. 页脚直接贴在 body 背景上只有一条线，显得"飘"

## 改动

**头部（Layout.tsx / ui.tsx / UserMenu.tsx）**
- 品牌 Link 加 `shrink-0`；品牌名 `whitespace-nowrap` 并去掉 `tracking-wide`；副标题 `hidden sm:block`（窄屏只留姓名，宽度预算让给工具钮）
- 新增 5 个 SVG 线性图标组件（IconSearch/IconSun/IconMoon/IconMenu/IconClose，16px stroke=currentColor），替换全部 emoji；跨端渲染一致、随主题着色
- 按钮尺寸体系统一：图标钮移动端 `h-11 w-11`（44px 触控）/ 桌面 `md:h-9 md:w-9`；搜索钮移动端纯图标方块、`md:w-auto` 展开文字+⌘K
- 工具栏 `gap-1.5 md:gap-2`；汉堡展开时图标变 X（aria-expanded 同步）
- **登录钮移出 <sm 头部**（宽度预算不够：375px 下品牌+4 钮需 ~365px > 335px 可用），收进汉堡菜单顶部账户区（未登录→「登录 / 注册」开 AuthModal；已登录→头像+用户名+管理+退出）

**页脚（Layout.tsx / index.css）**
- 加 `background: var(--bg-soft)` 基座，不再"飘"在 body 上
- 新增 `.footer-head` 组件类（var(--txt) 提亮，muted 留给链接），栏目标题与链接拉开层级
- 三栏改四栏 `[1.4fr_1fr_1fr_1fr]`：内容(博客/工具集市/归档/关于) + 逛逛(友链/导航/留言板/赞赏) + 模块(求职中台↗/内容管理/GitHub↗/RSS订阅)，**4+4+4 完全均衡**；顺带消除「赞赏」在内容/模块重复出现的问题
- 底栏加 `padding-bottom: max(1.25rem, env(safe-area-inset-bottom))` 避让 iPhone 手势条

## 验证（shot-header-footer.mjs 专项 + qa-errors / qa-style / qa-search 回归）

| 指标 | 结果 |
|---|---|
| 横向溢出（360/375/414/768/1024/1440 × 首页） | **全 0** |
| 品牌名单行（getClientRects=1） | **6 档宽度全过** |
| 头部按钮高度 | 移动端 44×3、桌面 36×4，**完全齐平** |
| 页脚链接数 / 栏数 | 12 条 / 4 栏（768+ 四列网格实测） |
| .footer-head 提亮 | rgb(232,238,248) = --txt（dark） |
| 汉堡菜单 | 11 行 + 「登录 / 注册」入口，展开变 X |
| 运行时错误（13 路由） | **0** |
| 样式严重问题 | **0**（2 处预存轻微低对比告警在工具详情页，非本次文件） |
| 搜索功能（弹窗+结果+跳转） | **PASS** |

构建 5.41s + tsc 0 错误；线上已加载 `index-CvIj30GS.css`；`/feed.xml` 200（页脚 RSS 链接真实有效）。
截图 13 张在 `E:/WorkBuddy/shots/`：hdr-{375,768,1440}-{light,dark}、ftr-同、menu-375-dark。

## 踩坑记录

- **CDP 截图坐标**：`captureBeyondViewport: true` 在移动端仿真下捕获的是"文档原始表面"，**不含 sticky 头部的合成层**（头在布局位 y0-64，不在粘贴位），且视口上方区域未绘制→空白。解法：头部特写用 `captureBeyondViewport: false` + clip.y = scrollY（裁视口顶部）；页脚在正常流里，beyond=true 无碍。
- `scroll-behavior: smooth` 会让 `scrollTo(0,200)` 异步执行，截图时序竞态→一律 `behavior: 'instant'`。
- 截图脚本直接 `setAttribute('data-theme')` 不同步 React 状态，主题图标可能与截图主题不一致（纯脚本瑕疵，产品无此问题——真实点击 toggle 会走 setState）。

---

# Round 8 · 赞赏页动态化改造（对标小白龙）+ 全流程测试验证

用户要求："赞赏那里……赞赏墙是动态的，做的炫一点，然后这个模块功能来进行测试验证"。以 `xiaolong0418.com`（项目内多处注释的标杆站）为参照重写 `/donate`，并用 `qa-donate.mjs` 做全流程验证。

## 需求拆解

| 小白龙特性 | 本站实现 |
|---|---|
| 三步收银台（选金额→扫码→完成） | 同构，步骤条带完成态对勾与渐变连接线 |
| 吉利金额档（6.66/8.88…） | `amounts` 改 `[1, 6.66, 8.88, 16.88, 66.66, 88.88]` |
| 二维码区视觉聚焦 | 呼吸光框 `dz-qr-glow` + 背后脉冲光环 `dz-qr-halo` |
| 最近赞赏横流 | 12 条横滑卡片，首条高亮 + LIVE 点 |
| 成功庆祝 | 扫光卡 `dz-shimmer` + 弹出对勾 `dz-pop/dz-wiggle` + ✨💫⭐ 漂浮 |
| （增强）数字滚动 | CountUp：0→终值 1.1s easeOutCubic，首次入场播，轮询刷新不重播；`prefers-reduced-motion` 落终值 |
| （增强）墙是活的 | 30s 轮询（页面隐藏暂停），别人的确认自动上墙 |
| （增强）大额激励 | ≥50 元金色头像 + 💎 大腿徽标；墙条目 stagger 入场（55ms 阶梯） |

数据：`donations.json` 重写为 12 条 confirmed 种子（多金额/多昵称/分散日期/合计 ¥246.60）+ 1 条 pending 供测试。

## 问题清单（测试驱动暴露，均已修）

1. **默认金额丢失（真实产品 bug）**：`useState(amounts[1] ?? 10)` 在首帧 `data` 未到达时错初始化成 10，数据到达后不更新——应付显示 ¥10 且无任何 chip 高亮。修法：`picked` 状态记"用户是否主动选过"，未选过则渲染时跟随 `amounts[1]`。
2. **步骤语义**：提交认领后第三步应为"完成"而非 active。`step = claimed ? STEPS.length + 1 : ...`。
3. **触控高度**：金额 chip `!py-1.5` 实测 29px < 30px  → `!py-2`（33px）。

## 改动

- `apps/web/src/pages/Donate.tsx`：重写（CountUp 组件、轮询、三步条、收银台、成功态、横流+墙、LicenseBlock 保留、管理端待确认保留）
- `apps/web/src/index.css`：追加 `dz-*` 动效系统（8 个 keyframes + 10 个类，`prefers-reduced-motion` 全局降级）
- `apps/api/data/donate.json`：吉利金额档；`donations.json`：12+1 种子
- `E:/WorkBuddy/tools/qa-donate.mjs`：新建，44 项断言 + 5 张截图 + 数据自动备份/还原

## 验证（qa-donate.mjs，44/44 通过）

| 分组 | 断言 |
|---|---|
| 结构 | 三步条 / 统计带四要素 / 6 档吉利 chip / 自定义输入 / **默认选中 ¥6.66** / 横流 12 / 墙 12 / 💎 2 条 / LIVE 点 3 |
| 动效 | CountUp 终值 12 位·¥246.60 / dz-qr-glow / dz-live-pulse / dz-qr-halo / 横流 overflow auto |
| 资源 | 微信收款码 naturalWidth>0 |
| 交互 | 选 ¥8.88→步骤2激活+步骤1渐变完成 / 自定义 5.5→¥5.50 / 切支付宝码图切换加载 / 认领→成功卡+三步全完成+扫光+漂浮3+金额正确 / pending API 可见 |
| 管理端 | 待确认区可见 / 徽标=1 / 确认后墙 13 / 首条 QA自动化测试 ¥5.50 / 统计 13 位·¥252.10 |
| 动态 | API 直插 → 31s 后页面自动 14 位 / 横流出现新记录 / 累计 ¥254.32 / 首条 ¥2.22 |
| 移动端 | 375 溢出 0 / chip 高 33px / 横流可滑 / 三步条不超屏 |

收尾：`donations.json` 自动还原（12+1/¥246.60，0 条 QA 残留）；截图 5 张在 `E:/WorkBuddy/shots/`：donate-{desktop,mobile}-{dark,light}、donate-success-dark。构建 6.90s + tsc 0 错误。

## 踩坑记录

- **改动后忘 build**：QA 首轮 16 项失败，一半根因是 dist 还是旧 bundle（`dz-wall` 不在包里）。改页面必先 build 再测。
- **headless 页面 hidden 的连锁**：`document.visibilityState==='hidden'` 时 `requestAnimationFrame` 不触发（CountUp 永远停 0）、轮询暂停（产品设计如此，测试是受害者）。每次导航后必须 `Page.bringToFront` 并复判 visible。
- **React 受控输入**：`el.value=v; dispatchEvent(new Event('input'))` 会被 React 的值跟踪器吞掉——必须 `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v)` 再派发。该坑还顺带解释了横流里那条"💙¥8.88 匿名好心人"：正是 nick 设不进去、服务端默认昵称的 QA 记录本身。
- **state 初始化时机**：`useState(props-derived)` 在异步数据首帧为空时会错初始化且不更新（本次默认金额 bug 的根因）——派生值应在渲染时计算，state 只存"用户意图"。

---

# Round 8 补充 · 「最近赞赏」横流改版（回应用户参考站截图）

用户贴出参考站截图，要求"这种横向滑动的"。将赞赏墙上方的「最近赞赏」从胶囊条改为参考站卡片流：

## 改动（Donate.tsx / donations.json）

- 横流条目：胶囊（💚金额昵称）→ **84px 紧凑卡片**：金额（accent 加粗）+ 相对时间（下一行 muted 小字）
- **首条高亮**：accent 描边 + 淡色底 + LIVE 脉冲点 + 「最新」徽标（对齐参考站）
- 新增 `relDate()`：**按日历日差**算——今天/昨天/X 天前（<30 天），更早显示「M月D日」；用日历日而非时间戳 floor，避免「1.5 天前」显示成「昨天」的歧义
- 横流加 `snap-x snap-mandatory` + 条目 `snap-start`：滑动时逐卡吸附，触屏手感更好；滚动条已由 `.dz-stream` 全局隐藏
- 种子日期打散：最旧 4 条推到 8 月，横流呈现「2 天前…11 天前 / 9月4日 / 8月29日…」混排（参考站同款质感；只改日期，不动金额/顺序）

## 验证（qa-donate.mjs 增补 2 项断言，46/46 通过）

| 断言 | 结果 |
|---|---|
| 横流 12 条 | PASS |
| 首条带「最新」徽标 | PASS :: ¥6.66 2 天前 最新 |
| 条目含金额+相对时间 | PASS |
| 375 横流可滑动 / 无溢出 | PASS |
| 轮询后新记录进横流首条 | PASS :: ¥2.22 今天 最新 |

截图 +2 张：`donate-stream-dark.png`（桌面横流特写）、`donate-stream-mobile-dark.png`（375 横流+墙）。

---

# Round 9 · 头部 1024~1440 导航换行修复 + 全量回归（回应用户截图）

用户截图反馈头部"样式错乱"：导航项逐字换行（"首/页""工/具/集/市"）。实测定位 + 修复 + 四类检查全量回归。

## 问题 1（主诉）：导航逐字换行

**实测数据**（登录态，各视口下导航链接高度）：

| 视口 | 修复前链接高度 | 修复后 |
|---|---|---|
| 1024 | **72px**（工具集市拆 4 行） | 32px 单行 |
| 1080~1440 | **52px**（全部 9 项 2~3 行） | 32px 单行 |
| ≥1536 | 32px（wrap 放宽到 1200px 才幸免） | 32px 单行 |

**根因**：`.wrap` 在 <1536 时内容宽 1040px（max-w-content 1080 − padding 40），品牌(~195) + 9 个导航项(~574) + 工具栏(~348) 共需 ~1165px，缺口 ~125px。nav 是 flex 行里唯一可收缩项（shrink 默认 1），被压窄后链接文字逐字 wrap——**不产生横向滚动，所以既往"溢出检测"全部漏报**。

**修复**（Layout.tsx / UserMenu.tsx，空间不够时工具栏分级让位）：
- nav 加 `shrink-0`，链接加 `whitespace-nowrap`——**永不换行**；px-3→px-2.5、gap-1→gap-0.5（省 ~52px）
- 工具栏同步 `shrink-0`，并按断点分级：`lg~xl` 用户名隐藏只露头像+角色片（`hidden sm:inline`→`hidden xl:inline`）；`<2xl` 搜索只显图标（文字+⌘K 改 `hidden 2xl:inline`）
- 效果：1024~1200 工具栏 232px / 1280~1440 276px（用户名出现）/ ≥1536 348px（搜索文字出现），各档余量 ≥37px

## 问题 2（回归顺带抓出）：畸形会话整站白屏

`wl_auth_v1` 为 `{}` 时 `isAuthed()` 因 `!session.exp` 判成"永久有效"→ 渲染层 `username.slice` TypeError → **整站空白**。修复（auth.ts）：
- 解析期形状校验 `isValidSession`：token/username/role 须为非空 string、exp 须为正数，否则清掉坏数据当未登录
- `isAuthed()` 改为 `!!session && Number.isFinite(session.exp) && exp*1000 > now`（缺 exp ≠ 已登录）
- 实测 6 种畸形（非法 JSON / 缺 token / 过期 / token 是数字 / 空对象 / null）全部正常渲染不再白屏
- 顺带修一致性：汉堡菜单账户区改用 `isAuthed()` 判断（过期会话不再头部显示"登录"、汉堡显示账户）

## 问题 3（样式审计）：二维码光环撑破父容器

`.dz-qr-halo`（`-inset-3` 装饰光环）超出紧贴二维码的父容器 12px（3 个 section 误报）。改父容器 `p-3` + 光环 `inset-0`——**视觉零变化**，布局变诚实。另将横流「最新」徽标 10px→11px（Round 6 立过全站 ≥11px 的规矩，本次横流改版违反，已修）。

## 全量回归（四类检查）

| 检查 | 脚本 | 结果 |
|---|---|---|
| 样式布局 | qa-layout-metrics（5 宽度 × 10 路由） | **0 溢出**，h1 27/34/36px 响应式 |
| 样式布局 | qa-style（3 视口 × 16 路由） | **0 严重问题**（修前 3） |
| 样式布局 | shot-header-fix.mjs（新建，1024/1200/1366/1440 × 深浅） | **28/28**：导航 9 项可见、链接单行 ≤36px、0 溢出、品牌名单行 |
| 功能 | qa-errors（13 路由） | **0 运行时错误**，移动端 0 溢出 |
| 功能 | qa-search（搜索→结果→跳转） | **PASS** |
| 功能 | qa-donate（赞赏模块全流程） | **46/46** |
| 代码 | tsc --noEmit + vite build | **0 错误**，6.83s |
| 接口 | qa-api-test | **105/105** |

截图：`E:/WorkBuddy/shots/hdr-fix-{1024,1200,1366,1440}-{dark,light}.png` 头部特写 6 张。

## 踩坑记录

- **flex 压缩型布局损坏没有溢出信号**：nav 被压窄后文字 wrap 但不产生 `scrollWidth` 增长，"横向溢出=0"全部通过——布局回归必须加"元素单行/高度上限"断言，不能只测溢出。
- **探针 textContent 读不到 display:none**：验收分级显隐时 `button.textContent` 含隐藏文字，会误判"用户名还在"——要么读 `offsetParent`/`getComputedStyle().display`，要么直接看截图。
- 畸形 localStorage 会话是真实用户场景（旧版本数据、手改、token 过期边界），**解析期校验比渲染层兜底更根本**。

---

# Round 10 · 赞赏页 1:1 还原小白龙 + 全流程 QA（回应用户"浏览参考站赞赏功能并对比"）

用户要求：使用浏览器实际浏览小白龙博客（xiaolong0418.com）的赞赏功能，1:1 还原到本站 `/donate`，并做对比。

## 一、参考站采集（Kimi 浏览器桥接驱动真实 Chrome）

采集脚本 `xl-donate-deep.mjs` / `xl-donate-deep2.mjs`，截图 14 张存 `E:/WorkBuddy/shots/xl/`：

- **整体结构**：一张大卡（hero 统计卡 + 三步条 + 左金额面板/右扫码栏 + 自定义金额 + 留言）+ 弹幕赞赏墙 + 最近赞赏横流 + 源码授权区
- **金额档位**：10 档 ¥0.01 / 0.88 / 1.68 / 6.66 / 8.88 / 16.88 / 18.88 / 66.66 / 88.88 / 168.88，默认高亮 ¥0.88。关键细节：**默认高亮 ≠ 已下单**，参考站点金额后才生成订单进 live 态
- **三步条**：选金额 → 扫码 → 完成；点金额后 1 done + 2 active；移动端 <640px 隐藏 label 改显「扫码」
- **扫码支付区**：空态文案「选择金额后将在此显示支付二维码」；live 态含「等待支付」脉冲徽标、应付金额、订单号、15 分钟有效提示、微信/支付宝双 badge（可点切换）、重新选择金额
- **弹幕赞赏墙**：5 轨横飞（duration 13.8~17.4s 稳定 hash、负 delay 进场即分布）、8 颗闪烁星星、舞台四角渐变角标、左右渐隐 mask
- **最近赞赏横流**：全量铺出横向滚动，首条「最新」渐变徽标 + 相对时间（参考站 29 位支持者全部铺出）
- **移动端 375**：金额 3 列网格、扫码栏独立成卡、步骤 label 隐藏

## 二、1:1 还原（Donate.tsx 全量重写 + index.css 移植约 1100 行 + donate.json 10 档）

结构、类名体系（`donate-*` / `donation-danmaku-*` / `donation-records-*`）、动效参数（scroll 13.8~17.4s / twinkle 3.2s / dz-rise / shimmer / icon-pop）、弹幕五配色、暖金色板（`--dw-gold/coral/warm/rose`）均对照参考站十六进制照搬。tsc 0 错误，vite build 5.6s。

## 三、小白龙 vs 本站对比

| 维度 | 小白龙（参考站） | 本站（一只狐狸的尾巴） | 结论 |
|---|---|---|---|
| 整体结构 | 大卡 + 弹幕墙 + 横流 | 同构 | 1:1 一致 |
| 金额档位 | 10 档，默认 ¥0.88 | 完全相同 | 1:1 一致 |
| 三步条 | 选金额/扫码/完成，移动端显「扫码」 | 相同流转 | 1:1 一致 |
| 扫码支付区 | 空态/live 态、订单号、15 分钟、双 badge、重新选择 | 相同 | 1:1 一致 |
| 弹幕赞赏墙 | 5 轨 + 8 星 + 四角角标 + 渐隐 mask | 相同 | 1:1 一致 |
| 最近赞赏横流 | 全量铺出横向滚动 + 「最新」徽标 | 相同 | 1:1 一致 |
| 移动端 375 | 3 列网格 / 扫码栏独立卡 / label 隐藏 | 相同 | 1:1 一致 |
| 主题 | 浅色（深色导航） | **深浅双主题**（CSS 变量 + data-theme） | 本站增强 |
| 动效 | 弹幕滚动 / 星星闪烁 | + 大卡入场 dz-rise / 成功横幅扫光 / 图标弹入 / 数字 CountUp | 本站增强 |
| 赞赏数据流 | 静态展示（真实支付走云购 OS） | **认领 → 待确认 → 管理员确认上墙** + 30s 轮询自动刷新 | 本站增强 |
| 管理端 | 独立后台 | 页内待确认区（徽标 + 确认/删除） | 本站增强 |
| 无障碍降级 | reduced-motion 下弹幕瞬移全叠左侧（缺陷） | 静态 flex 平铺 | 本站修复 |

## 四、QA 结果（`tools/qa-donate.mjs`，79 项断言）

| 分组 | 断言数 | 结果 |
|---|---|---|
| 页面结构（1:1） | 25 | 全通过 |
| CountUp / 动效注册 | 8 | 全通过 |
| 交互（点金额→live/切支付宝/复位/自定义/确认） | 18 | 全通过 |
| 认领 → 成功横幅 → 管理员确认上墙 | 12 | 全通过 |
| 轮询动态刷新（31s） | 7 | 全通过 |
| 移动端 375 | 7 | 全通过 |
| 视觉截图 | 7 张 | desktop/mobile × 深浅 + wall/live/success 特写 |

轮询验证：API 直插 confirmed → 31s 后页面墙徽标 12→14 位、弹幕自动出现、累计静默变 ¥272.32、横流首条变 ¥2.22、CountUp 静默刷新——无手动刷新。

## 五、修复清单（本轮）

1. **step 逻辑**：认领后 `step=3` 只亮 2 个完成态 → 改 `STEPS.length + 1`，三步全 done
2. **textarea 受控输入**：`HTMLInputElement.prototype` 的 value setter 喂给 textarea 抛 `Illegal invocation` → 按 `el.tagName` 选原型（QA 脚本坑）
3. **大额去尾零**：新增 `moneyTrim()`，扫码区/成功横幅 ¥23.5 不再显示 ¥23.50
4. **横流上限**：原 `slice(0, 12)` 与参考站「全量铺出」不符（参考站 29 位全部铺出）→ 全量渲染
5. **QA 累计断言算错**：246.60 + 23.50 = **270.10**（原写 269.60），轮询后 **272.32**（原写 271.82）
6. **reduced-motion 降级**：全局 `animation-duration: 0.01ms` 会让弹幕瞬间飞到终态（translate 出左侧、全叠一起）→ 专门覆盖为静态 flex 平铺（参考站在该场景有此缺陷，本站修复）
7. **空态 hint 文案**补「二维码 15 分钟内有效」

## 六、数据卫生

QA 前后对 `donations.json` 备份/还原，测试写入的 pending/confirmed 全部清除。另查明并回滚了一条 03:01 被误确认的 ¥10 种子记录（API 无自动确认逻辑，系旧自动化/人工操作）。最终恢复种子态：**12 条 confirmed（合计 ¥246.60）+ 1 条 pending（¥10）**。

截图：本站 7 张于 `E:/WorkBuddy/shots/donate-*`；参考站 14 张于 `E:/WorkBuddy/shots/xl/`。

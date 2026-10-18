import { Link } from 'react-router-dom';
import { useApi } from '../lib/api';
import type { SiteMeta, Stats } from '../lib/types';
import { FoxMark } from '../components/ui';

const STACK = [
  { group: '前端', items: ['React 18', 'TypeScript', 'Vite', 'Tailwind', 'React Router', '原生 JS / Canvas'] },
  { group: '后端', items: ['Node.js', 'Express', 'TypeScript', 'REST 设计', 'JSON / SQLite', '鉴权与分页'] },
  { group: '工程化', items: ['Monorepo', 'npm workspaces', 'ESLint / Prettier', 'Git', 'CI 思路'] },
  { group: 'AI', items: ['LLM 结构化抽取', 'Prompt 工程', '向量检索', 'Agent 流程编排'] },
];

const ROADMAP = [
  {
    stage: '第 1 层',
    title: '能跑起来',
    done: true,
    desc: 'HTML/CSS/JS 扎实，写一个不用框架的 CRUD，用 Node 起接口，买台服务器挂上去。',
    deliver: '一个别人能访问的网址',
  },
  {
    stage: '第 2 层',
    title: '能维护',
    done: true,
    desc: 'React + TypeScript + 路由 + 状态，组件拆分、接口封装、加载与错误态。',
    deliver: '一个前后端分离、别人看得懂的项目',
  },
  {
    stage: '第 3 层',
    title: '能上量',
    done: false,
    desc: '数据库设计与索引、鉴权、缓存、部署与日志、域名 / HTTPS / 备案。',
    deliver: '一套有用户、有监控的系统',
  },
  {
    stage: '第 4 层',
    title: 'AI 增强',
    done: false,
    desc: 'LLM 做结构化抽取，embedding 做个人知识库，Agent 做流程编排。',
    deliver: '至少一处大模型在替我干重复活',
  },
];

export default function About() {
  const { data: meta } = useApi<SiteMeta>('/meta');
  const { data: stats } = useApi<Stats>('/stats');

  return (
    <div className="wrap max-w-4xl pt-12">
      <header>
        <p className="kicker">about</p>
        <h1 className="mt-3 h1">关于这个站</h1>
      </header>

      {/* 自我介绍 */}
      <section className="card mt-8 flex flex-col gap-6 p-7 sm:flex-row sm:items-center">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl shadow-lg"
          style={{ background: '#fff4ec', border: '1px solid rgba(239,125,58,0.35)' }}
        >
          <FoxMark size={50} />
        </div>
        <div>
          <h2 className="text-lg font-bold">{meta?.site?.author || '赵子轩'} · 前端工程师</h2>
          <p className="mt-2 lede">
            找工作这段时间，我把重复劳动都写成了程序：自动扫岗、批量投递、题库整理。
            这个站是那些东西的展示柜，也是我练习前后端分离和 AI 全栈的地方。
            目前有 {stats?.posts ?? 0} 篇文章、{stats?.tools ?? 0} 个工具、{stats?.projects ?? 0} 个项目。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={meta?.site?.github || '#'} target="_blank" rel="noreferrer" className="btn h-8 text-xs">GitHub ↗</a>
            <a href={`mailto:${meta?.site?.email || 'hello@example.com'}`} className="btn h-8 text-xs">邮箱</a>
            <Link to="/tools" className="btn h-8 text-xs">看工具与项目</Link>
          </div>
        </div>
      </section>

      {/* 技术栈 */}
      <section className="mt-14">
        <h2 className="text-lg font-bold">在用的技术</h2>
        <p className="mt-1.5 text-sm muted">不求全会，求每个都真写过东西。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {STACK.map((s) => (
            <div key={s.group} className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] muted">{s.group}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.items.map((i) => (
                  <span key={i} className="chip !py-0.5 text-[11px]">{i}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 路线 */}
      <section className="mt-14">
        <h2 className="text-lg font-bold">AI 全栈路线</h2>
        <p className="mt-1.5 text-sm muted">按「能交付什么」排，不按知识点排。每层都要有产物。</p>

        <div className="mt-6 space-y-3">
          {ROADMAP.map((r, i) => (
            <div key={r.title} className="card relative flex gap-4 p-5">
              <div className="flex flex-col items-center">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                  style={{
                    background: r.done ? 'linear-gradient(135deg, var(--accent), var(--accent2))' : 'var(--panel2)',
                    color: r.done ? '#fff' : 'var(--muted)',
                    border: r.done ? 'none' : '1px solid var(--line)',
                  }}
                >
                  {r.done ? '✓' : i + 1}
                </span>
                {i < ROADMAP.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: 'var(--line)' }} />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] muted">{r.stage}</span>
                  <h3 className="text-sm font-semibold">{r.title}</h3>
                  {r.done ? (
                    <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--ok)' }}>已完成</span>
                  ) : (
                    <span className="chip !py-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>进行中</span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed muted">{r.desc}</p>
                <p className="mt-2 text-[12px]" style={{ color: 'var(--accent)' }}>交付物：{r.deliver}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 站点架构 */}
      <section className="mt-14">
        <h2 className="text-lg font-bold">这个站怎么搭的</h2>
        <p className="mt-1.5 text-sm muted">前后端完全分离，一个仓库两个应用，接口契约先定。</p>
        <pre className="card mt-5 overflow-x-auto p-5 text-[12.5px] leading-relaxed" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
{`portfolio/
├─ apps/
│  ├─ web/          # React + TS + Vite + Tailwind（5173）
│  │  └─ src/{pages,components,lib}
│  └─ api/          # Express + TS（3001）
│     ├─ src/routes/{posts,tools,projects}.ts
│     └─ data/*.json   # 内容即数据，随时可换库
└─ package.json     # npm workspaces，一条命令起双端`}
        </pre>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['接口先行', 'GET /api/posts?cat=&q=&page='],
            ['写入受控', 'x-admin-token 保护所有写操作'],
            ['可迁移', 'JSON → SQLite / Postgres 只换一层'],
          ].map(([t, d]) => (
            <div key={t} className="card p-4">
              <p className="text-xs font-semibold">{t}</p>
              <p className="mt-1.5 break-all text-[11px] muted" style={{ fontFamily: 'ui-monospace, monospace' }}>{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

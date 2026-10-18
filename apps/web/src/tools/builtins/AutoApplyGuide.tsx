import { getSession, isAuthed } from '../../lib/auth';
import { http, useApi } from '../../lib/api';
import { useState } from 'react';

interface BridgeStatus {
  kimi: { ok: boolean; addr: string; extensionConnected: boolean; version: string | null };
  hunter: { ok: boolean; addr: string; consoleUrl: string | null };
  checkedAt: string;
}

function Light({ ok, title, desc, extra }: { ok: boolean; title: string; desc: string; extra?: string }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]"
        style={{
          background: ok ? 'color-mix(in srgb, var(--ok) 20%, transparent)' : 'var(--panel2)',
          color: ok ? 'var(--ok)' : 'var(--muted)',
        }}
      >
        {ok ? '✓' : '○'}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed muted">{desc}</p>
        {extra && <p className="mt-1 font-mono text-[11px] muted">{extra}</p>}
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    t: '装 Kimi 浏览器扩展并启动本地桥接',
    d: '在 Chrome 装 Kimi 扩展（当前已装 2.0.23）。扩展会在本机起一个桥接服务，AI 通过它操作你**已登录**的浏览器——这是自动投递能跑起来的前提。',
    cmd: 'kimi-webbridge start   # 或扩展面板直接开启，默认 127.0.0.1:10086',
  },
  {
    n: '02',
    t: '在浏览器里登录招聘平台',
    d: '用你自己的账号登录 BOSS 直聘 / 牛客。投递引擎不存密码、不模拟登录，只复用你浏览器里已有的会话，所以登录态永远在你自己机器上。',
    cmd: null,
  },
  {
    n: '03',
    t: '启动求职中台（8080）并配置求职偏好',
    d: '中台负责岗位池、打分、去重、招呼语生成。双击 job-hunter 目录下的 start.bat 即可；也可在站内「求职中台」模块直接操作。',
    cmd: 'cd job-hunter && start.bat',
  },
  {
    n: '04',
    t: '跑一次干跑，确认方向对了再真投',
    d: '先 --dry-run 看打分和岗位列表，确认「方向校验」没把不相关的岗位塞进来，再放开配额真投。单次上限、间隔随机化、遇验证码即停都是内置的。',
    cmd: 'node agent/auto_apply.js --dry-run --limit 5',
  },
];

export function AutoApplyGuide() {
  const { data, loading } = useApi<BridgeStatus>('/bridge/status');
  const [refreshing, setRefreshing] = useState(false);
  const [fresh, setFresh] = useState<BridgeStatus | null>(null);
  const session = getSession();
  const s = fresh || data;

  const recheck = async () => {
    setRefreshing(true);
    try {
      setFresh(await http.get<BridgeStatus>('/bridge/status'));
    } catch {
      /* 保留上一次结果 */
    }
    setRefreshing(false);
  };

  return (
    <div className="grid gap-4">
      {/* 自检 */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] muted">接入自检</p>
            <p className="mt-1 text-[12px] muted">
              自动投递依赖你本机两个服务，服务端实时探测（不经过浏览器，避免 CORS 误判）。
            </p>
          </div>
          <button className="btn h-9 text-xs" onClick={recheck} disabled={refreshing || loading}>
            {refreshing ? '检查中…' : '重新检查'}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {loading && !s ? (
            <p className="text-xs muted">检查中…</p>
          ) : (
            <>
              <Light
                ok={!!s?.kimi.ok}
                title="Kimi 浏览器桥接"
                desc={s?.kimi.ok ? '已运行，扩展已连接' : '未启动 —— 无法驱动浏览器'}
                extra={`${s?.kimi.addr}${s?.kimi.version ? ' · v' + s.kimi.version : ''}${s?.kimi.ok && !s.kimi.extensionConnected ? ' · 扩展未连接' : ''}`}
              />
              <Light
                ok={!!s?.hunter.ok}
                title="求职自动化中台"
                desc={s?.hunter.ok ? '已运行，岗位池可用' : '未启动 —— 双击 job-hunter/start.bat'}
                extra={s?.hunter.addr}
              />
              <Light
                ok={isAuthed()}
                title="本站账号"
                desc={isAuthed() ? `已登录：${session?.username}` : '未登录 —— 多用户数据隔离需要账号'}
                extra={isAuthed() ? `角色 ${session?.role}` : undefined}
              />
            </>
          )}
        </div>
        {s && (
          <p className="mt-2 text-[11px] muted">
            检查时间 {new Date(s.checkedAt).toLocaleTimeString('zh-CN', { hour12: false })}
          </p>
        )}
      </div>

      {/* 为什么必须本机跑 */}
      <div className="card p-4">
        <p className="kicker">关键约束</p>
        <h3 className="mt-1.5 text-[15px] font-bold">为什么投递引擎不能搬到服务器上</h3>
        <p className="mt-2 text-[12.5px] leading-relaxed muted">
          招聘平台的投递动作发生在<strong>你登录后的浏览器会话</strong>里：Cookie、设备指纹、风控、验证码都绑在这台机器上。
          服务器上没有你的登录态，硬要用无头浏览器模拟登录，轻则立刻触发风控，重则封号。
          所以引擎的正确位置是<strong>留在你的电脑</strong>，云端只负责「配置、数据、任务编排」。
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[12px]">
          {[
            ['云端（可上服务器）', '账号体系、求职偏好、岗位池、投递记录、招呼语模板、统计看板'],
            ['本机（必须留本地）', 'Kimi 浏览器桥接、真实 Chrome 登录态、投递点击、验证码处理'],
            ['同步（Token 打通）', '本机拉任务 → 执行 → 回传结果；本机只拿令牌，不存密码'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>
              <p className="font-semibold">{t}</p>
              <p className="mt-1 leading-relaxed muted">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 接入步骤 */}
      <div className="card p-4">
        <p className="kicker">接入步骤</p>
        <h3 className="mt-1.5 text-[15px] font-bold">四步跑通自动投递</h3>
        <div className="mt-3 space-y-3">
          {STEPS.map((s2) => (
            <div key={s2.n} className="flex gap-3">
              <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--accent)' }}>{s2.n}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{s2.t}</p>
                <p className="mt-1 text-[12px] leading-relaxed muted">{s2.d}</p>
                {s2.cmd && (
                  <code className="mt-1.5 inline-block rounded px-2 py-1 font-mono text-[11px]" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                    {s2.cmd}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 多用户演进 */}
      <div className="card p-4">
        <p className="kicker">多用户化路线</p>
        <h3 className="mt-1.5 text-[15px] font-bold">从「我自己用」到「给用户用」</h3>
        <div className="mt-3 space-y-2.5 text-[12px] leading-relaxed">
          {[
            ['现状（单人）', '一份 resume_profile.json、一个岗位池、一个投递日志，全部写在本机 data/ 目录，账号不分你我。'],
            ['目标（按账号隔离）', '每个账号有自己的求职偏好（城市/薪资/经验/技能）、岗位池、简历版本、投递记录；引擎执行时带上该账号的令牌，只处理属于他的任务。'],
            ['个性化怎么落地', '招呼语与岗位打分已经按「JD 命中的技术栈/业务域 + 简历真实项目」生成；多用户化只需把简历与偏好从全局文件换成按 userId 取，生成逻辑不用改。'],
            ['数据同步打通', '云端存配置与结果；本机 agent 用账号令牌轮询任务、回写日志。断网时本机照跑，恢复后补传。'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)', background: 'var(--panel2)' }}>
              <p className="font-semibold">{t}</p>
              <p className="mt-1 muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] muted">
          这套拆分的前提是：登录态永远留在用户自己机器上，平台方只做编排与存储——既绕开风控，也避免替用户保管招聘平台凭据的合规风险。
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { http } from '../../lib/api';

/** 简历润色：规则引擎（默认，离线可用）+ LLM 模式（可选配置） */
interface Issue { line: number; type: string; from?: string; to?: string; tip: string }
interface PolishResult {
  score: number; issues: Issue[]; polished: string;
  stats: { lines: number; bullets: number; metrics: number }; engine: 'rules' | 'llm';
}

const SAMPLE = `个人信息
赵梓轩 / 5 年前端开发经验 / 138-0000-0000

工作经历
某互联网公司 2021.06 - 至今
- 负责公司中后台系统前端开发，参与多个需求迭代
- 熟悉 React、TypeScript，了解 Node.js
- 协助后端完成接口联调，做了一些性能优化

项目经历
求职自动化中台
- 负责投递引擎开发，使用 Node.js 和浏览器桥接
- 实现了岗位池同步、自动投递等功能
- 吃苦耐劳，学习能力强，有团队精神`;

const TYPE_LABEL: Record<string, string> = {
  'weak-verb': '弱动词', buzzword: '空话', 'no-metric': '缺量化', 'too-long': '超长', vague: '模糊词', positive: '通过',
};

export function ResumePolish() {
  const [text, setText] = useState('');
  const [useLlm, setUseLlm] = useState(false);
  const [r, setR] = useState<PolishResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showLlm, setShowLlm] = useState(false);

  const run = async () => {
    if (text.trim().length < 20) { setErr('内容太短，先粘贴简历全文'); return; }
    setLoading(true); setErr('');
    try {
      setR(await http.post<PolishResult>('/toolkit/resume/polish', { text, useLlm }));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold muted">简历原文</span>
          <div className="flex gap-2">
            <button className="btn sm" onClick={() => setText(SAMPLE)}>填入示例</button>
            <button className="btn sm" onClick={() => { setText(''); setR(null); }}>清空</button>
          </div>
        </div>
        <textarea className="inp font-mono" style={{ width: '100%', minHeight: 380, resize: 'vertical', fontSize: 12 }}
          placeholder="把简历全文粘到这里…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn primary" onClick={run} disabled={loading}>
            {loading ? '分析中…' : useLlm ? 'LLM 润色' : '规则润色'}
          </button>
          <label className="flex items-center gap-1 text-xs muted">
            <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
            LLM 模式（需配置接口）
          </label>
          <button className="btn sm ml-auto" onClick={() => setShowLlm((v) => !v)}>⚙ 大模型设置</button>
        </div>
        {err && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{err}</p>}
        {showLlm && <LlmPanel />}
      </div>

      <div className="grid gap-4">
        {r && (
          <>
            <div className="card flex items-center gap-4 p-4">
              <ScoreRing score={r.score} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  体检结果 <span className="muted text-[11px] font-normal">（{r.engine === 'llm' ? 'LLM 引擎' : '规则引擎'} · {r.stats.bullets} 条经历 · {r.stats.metrics} 条含量化）</span>
                </p>
                <div className="mt-2 grid gap-1.5" style={{ maxHeight: 260, overflow: 'auto' }}>
                  {r.issues.map((it, i) => (
                    <div key={i} className="flex gap-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
                      <span className="chip !py-0 shrink-0 !text-[11px]"
                        style={it.type === 'positive' ? { color: '#16a34a', borderColor: '#16a34a' } : it.type === 'weak-verb' ? { color: '#3b82f6', borderColor: '#3b82f6' } : undefined}>
                        {it.line > 0 ? `L${it.line} ` : ''}{TYPE_LABEL[it.type] || it.type}
                      </span>
                      <span className="min-w-0">{it.tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold muted">润色后（已应用安全替换）</span>
                <button className="btn sm" onClick={() => navigator.clipboard.writeText(r.polished)}>复制全文</button>
              </div>
              <pre className="inp" style={{ width: '100%', minHeight: 380, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.7 }}>
                {r.polished}
              </pre>
            </div>
          </>
        )}
        {!r && <div className="card empty">粘贴简历 → 点「规则润色」，左侧出问题清单、右侧出改进稿。规则引擎零依赖离线可用；配置大模型后可换 LLM 深度改写。</div>}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? '#16a34a' : score >= 65 ? '#f59e0b' : '#e5484d';
  const c = 2 * Math.PI * 26;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--line, #e5e7eb)" strokeWidth="6" />
      <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

function LlmPanel() {
  const [token, setToken] = useState(localStorage.getItem('wb_admin_token') || 'dev-token');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState('');

  const save = async () => {
    setMsg('保存中…');
    try {
      await http.post('/toolkit/config', { llm: { baseUrl, apiKey, model } }, token);
      localStorage.setItem('wb_admin_token', token);
      setMsg('已保存 ✓（OpenAI 兼容接口，如 https://api.openai.com/v1）');
    } catch (e) { setMsg('失败：' + (e as Error).message); }
  };

  return (
    <div className="mt-3 grid gap-2 rounded-lg p-3" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
      <p className="text-[11px] muted">填写任意 OpenAI 兼容接口（/chat/completions）。不填则只用规则引擎。</p>
      <input className="inp sm" placeholder="baseUrl，如 https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <input className="inp sm" placeholder="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <input className="inp sm" placeholder="model，如 gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} />
      <div className="flex items-center gap-2">
        <input className="inp sm flex-1" placeholder="管理 token（默认 dev-token）" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="btn sm" onClick={save}>保存</button>
      </div>
      {msg && <p className="text-[11px] muted">{msg}</p>}
    </div>
  );
}

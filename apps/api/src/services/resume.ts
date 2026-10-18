import { loadConfig } from './toolkit.js';

/* ============================================================
 * resume.ts — 简历润色
 *  - 规则引擎（零依赖，离线可用）：弱动词替换 / 空话检测 / 量化提醒 / 长度检查
 *  - LLM 模式（可选）：OpenAI 兼容接口，配置见 data/tool-config.json
 * ============================================================ */

export interface ResumeIssue {
  line: number;
  type: 'weak-verb' | 'buzzword' | 'no-metric' | 'too-long' | 'vague' | 'positive';
  from?: string;
  to?: string;
  tip: string;
}

export interface PolishResult {
  score: number;
  issues: ResumeIssue[];
  polished: string;
  stats: { lines: number; bullets: number; metrics: number };
  engine: 'rules' | 'llm';
}

const WEAK_VERBS: [RegExp, string, string][] = [
  [/负责/g, '主导', '「负责」偏被动，「主导/推动/落地」更能体现主动性'],
  [/参与/g, '深度参与并交付', '「参与」稀释贡献，建议写清你具体交付了什么'],
  [/协助/g, '协同', '「协助」显得边缘化，能换成「协同推动」更好'],
  [/熟悉/g, '掌握', '「熟悉」是知道，「掌握」是会用，用词要匹配真实水平'],
  [/了解/g, '具备…基础并在项目中使用', '「了解」最弱，要么删掉要么换成使用证据'],
  [/做了/g, '完成了', '「做了」口语化'],
];

const BUZZWORDS = [
  '吃苦耐劳', '学习能力强', '性格开朗', '抗压能力强', '有团队精神', '踏实肯干',
  '认真负责', '积极主动', '善于沟通',
];

const VAGUE = ['等等', '一些', '很多东西', '各种', '之类的', '大概', '差不多'];

const BULLET_RE = /^\s*(?:[-*·•]|\d+[.、)])\s*/;

export function polishResume(input: string): PolishResult {
  const lines = input.split('\n');
  const issues: ResumeIssue[] = [];
  const polishedLines: string[] = [];
  let bullets = 0;
  let metrics = 0;

  lines.forEach((raw, i) => {
    let line = raw;
    const no = i + 1;
    const isBullet = BULLET_RE.test(line) || /^[一-龥]{2,10}[：:，,]\s*\S/.test(line.trim());
    if (isBullet) bullets++;

    // 弱动词替换（直接改进 polished 文本）
    for (const [re, to, tip] of WEAK_VERBS) {
      if (re.test(line)) {
        issues.push({ line: no, type: 'weak-verb', from: re.source.replace(/\\/g, ''), to, tip });
        line = line.replace(re, to);
      }
    }

    // 空话
    for (const w of BUZZWORDS) {
      if (line.includes(w)) issues.push({ line: no, type: 'buzzword', tip: `「${w}」是无证据自我评价，HR 基本跳过；换成可验证的事实（数据/结果/作品）` });
    }

    // 模糊词
    for (const w of VAGUE) {
      if (line.includes(w)) issues.push({ line: no, type: 'vague', tip: `「${w}」会让描述失焦，改成具体范围或删掉` });
    }

    // 量化检测：有数字即算
    if (/\d/.test(line)) metrics++;

    // 长度检查
    if (line.trim().length > 80) {
      issues.push({ line: no, type: 'too-long', tip: '单条超过 80 字，拆成「动作 + 对象 + 结果」两句更易读' });
    }

    polishedLines.push(line);
  });

  // 全篇缺数字 → 提醒
  if (bullets >= 3 && metrics / Math.max(1, bullets) < 0.5) {
    issues.push({
      line: 0,
      type: 'no-metric',
      tip: `全文 ${bullets} 条经历只有 ${metrics} 条带数字。每条尽量补一个可量化结果（性能提升 40%、支撑 DAU 10w+、覆盖 3 个业务线…），没有精确数据就写范围或体量`,
    });
  }

  const penalty = Math.min(50, issues.length * 6);
  const score = Math.max(40, 100 - penalty);

  // 无问题时给一条正向反馈，避免空数组
  if (!issues.length) {
    issues.push({ line: 0, type: 'positive', tip: '用词和结构都不错，保持「动词 + 对象 + 量化结果」的写法即可' });
  }

  return {
    score,
    issues,
    polished: polishedLines.join('\n'),
    stats: { lines: lines.length, bullets, metrics },
    engine: 'rules',
  };
}

/** LLM 润色（OpenAI 兼容 /chat/completions） */
export async function polishWithLlm(input: string): Promise<PolishResult> {
  const cfg = loadConfig().llm;
  if (!cfg?.baseUrl || !cfg?.apiKey) {
    throw new Error('尚未配置大模型：在工具页右上角「设置」里填写 OpenAI 兼容接口（baseUrl / apiKey / model）');
  }
  const base = cfg.baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              '你是资深技术简历顾问。逐条优化用户简历：把弱动词换成强动作词、补量化占位（用【补：】标出需要用户填数据的位置）、删除无证据自我评价、保持原意与事实不变、输出 Markdown。只输出润色后的简历全文，不要解释。',
          },
          { role: 'user', content: input },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM 接口 ${res.status}：${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM 返回为空');
    const rules = polishResume(input);
    return { ...rules, polished: text, engine: 'llm' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('LLM 请求超时（90 秒）');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

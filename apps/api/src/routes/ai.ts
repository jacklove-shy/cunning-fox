import { Router } from 'express';
import type { Post } from '../types.js';
import { readJson } from '../store.js';
import { loadConfig } from '../services/toolkit.js';

/**
 * 站内 AI 助手（对齐小白龙的「基于站内文章回答」）。
 * 流程：关键词检索文章 → 有 LLM 配置就把资料拼进 prompt 让模型作答；没有就返回检索式回答。
 * 不引入向量库：文章量小（个位数～几十篇），词频打分足够且零依赖。
 */
export const aiRouter = Router();

interface Source {
  title: string;
  slug: string;
  summary: string;
}

interface Hit extends Source {
  score: number;
  snippet: string;
}

const STOP = new Set([
  '什么', '怎么', '如何', '这个', '那个', '可以', '有没有', '介绍', '一下', '请问', '关于', '哪些', '的是', '我想',
]);

function terms(q: string): string[] {
  const raw = q.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, ' ');
  const out = new Set<string>();
  for (const part of raw.split(/\s+/).filter(Boolean)) {
    // 英文/数字：整词；中文：整段 + 2 字滑窗（中文无空格，不切 bi-gram 整句永远匹配不到）
    if (/^[a-z0-9_.+-]+$/.test(part)) {
      if (part.length >= 2) out.add(part);
      continue;
    }
    if (part.length >= 2) out.add(part);
    for (let i = 0; i + 2 <= part.length; i++) out.add(part.slice(i, i + 2));
  }
  return [...out].filter((t) => t.length >= 2 && !STOP.has(t));
}

/** 从正文里挑出包含关键词的段落做片段（最多两段、420 字） */
function snippetOf(content: string, ts: string[], max = 420): string {
  const paras = content
    .split(/\n{2,}/)
    .map((p) => p.replace(/[#>*`]/g, '').trim())
    .filter(Boolean);
  const hit = paras.filter((p) => ts.some((t) => p.toLowerCase().includes(t)));
  const pick = (hit.length ? hit.slice(0, 2) : paras.slice(0, 1)).join('\n\n');
  return pick.slice(0, max);
}

function retrieve(q: string, limit = 3): Hit[] {
  const ts = terms(q);
  if (!ts.length) return [];
  const posts = readJson<Post[]>('posts.json', []).filter((p) => p.status === 'published');
  const hits: Hit[] = [];
  for (const p of posts) {
    const title = p.title.toLowerCase();
    const tags = p.tags.join(' ').toLowerCase();
    const sum = p.summary.toLowerCase();
    const body = p.content.toLowerCase();
    let score = 0;
    for (const t of ts) {
      if (title.includes(t)) score += 6;
      if (tags.includes(t)) score += 4;
      if (sum.includes(t)) score += 2;
      const n = body.split(t).length - 1;
      if (n > 0) score += Math.min(3, 1 + n);
    }
    if (score > 0) {
      hits.push({ title: p.title, slug: p.slug, summary: p.summary, score, snippet: snippetOf(p.content, ts) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

aiRouter.post('/ask', async (req, res) => {
  const q = String(req.body?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q 必填' });
  if (q.length > 200) return res.status(400).json({ error: '问题太长（≤200 字）' });

  const hits = retrieve(q);
  const sources: Source[] = hits.map(({ title, slug, summary }) => ({ title, slug, summary }));

  if (!hits.length) {
    return res.json({
      mode: 'search',
      answer: '站内暂时没有找到和这个问题相关的文章。换个关键词试试，或者去留言板提问。',
      sources: [],
    });
  }

  const cfg = loadConfig().llm;

  // 没有配置大模型：检索式回答
  if (!cfg?.baseUrl || !cfg?.apiKey) {
    const list = hits
      .map((h, i) => `${i + 1}. 《${h.title}》\n${h.snippet.slice(0, 180)}…`)
      .join('\n\n');
    return res.json({
      mode: 'search',
      answer:
        `按关键词在站内找到 ${hits.length} 篇相关文章：\n\n${list}\n\n` +
        '（当前是站内检索模式。在「工具集市」右上角「设置」里配置大模型后，我可以把资料总结成一段直接回答。）',
      sources,
    });
  }

  // 有 LLM：资料 + 问题
  const context = hits
    .map((h, i) => `【资料${i + 1}】标题：${h.title}\n摘要：${h.summary}\n正文片段：${h.snippet}`)
    .join('\n\n');

  const base = cfg.baseUrl.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              '你是本站的 AI 助手。只能依据【资料】回答，不要编造资料以外的内容；资料不足就直说没找到。' +
              '回答用中文、简洁分点，末尾用「参考：《标题》」列出引用的文章。',
          },
          { role: 'user', content: `【资料】\n${context}\n\n【问题】${q}` },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`LLM ${r.status}`);
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('LLM 返回为空');
    res.json({ mode: 'llm', answer, sources });
  } catch (e) {
    const list = hits.map((h, i) => `${i + 1}. 《${h.title}》`).join('\n');
    res.json({
      mode: 'search',
      answer: `大模型调用失败（${(e as Error).message}），先给你站内检索结果：\n\n${list}`,
      sources,
    });
  } finally {
    clearTimeout(timer);
  }
});

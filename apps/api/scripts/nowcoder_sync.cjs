#!/usr/bin/env node
/**
 * nowcoder_sync.js — 牛客网「前端校招面试题目合集」抓取（只读，不动牛客任何数据）
 *
 * 数据源：https://www.nowcoder.com/ta/review-frontend/review?query=&asc=true&order=&page=N
 *   - page 参数 = 题号（1..464），服务端直出「题目标题 + 参考答案」，无需登录
 *   - 题型：问答题（客观选择题价值低，本合集全部为问答题）
 *
 * 落库：data/question_bank.json（全量重建，保留本地掌握度/收藏进度）
 * 进度：data/quiz_progress.json（id → { mastery, starred }），换题不丢
 *
 * 用法：
 *   node nowcoder_sync.js                 # 全量抓取（默认 1-464）
 *   node nowcoder_sync.js --from 1 --to 50    # 抓 1-50 题（试跑）
 *   node nowcoder_sync.js --delay 1500        # 每页间隔毫秒（默认 1200）
 *   node nowcoder_sync.js --keep-existing     # 与旧题库合并而非全量重建
 *
 * 输出：过程日志 + 末行 JSON（server 解析用）：
 *   { ok, fetched, skipped, total, catStat, durationMs }
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BANK_FILE = path.join(ROOT, 'data', 'question_bank.json');
const PROG_FILE = path.join(ROOT, 'data', 'quiz_progress.json');
const BASE = 'https://www.nowcoder.com/ta/review-frontend/review?query=&asc=true&order=&page=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const opt = { from: 1, to: 464, delay: 1200, keepExisting: false };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--from') opt.from = Math.max(1, +argv[++i] || 1);
  else if (argv[i] === '--to') opt.to = Math.max(opt.from, +argv[++i] || 464);
  else if (argv[i] === '--delay') opt.delay = Math.max(300, +argv[++i] || 1200);
  else if (argv[i] === '--keep-existing') opt.keepExisting = true;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const info = m => console.log('[nowcoder] ' + m);

// ---------- 子分类推断（按优先级，先具体后通用） ----------
const CAT_RULES = [
  ['Vue', /vue|vuex|vue-router|vue3|组合式\s*api|pinia|keep-alive/i],
  ['React', /react|redux|hooks|jsx|fiber|setstate|useState|useEffect/i],
  ['TypeScript', /typescript|\bts\b|泛型|类型断言|interface|declare/i],
  ['工程化', /webpack|vite|rollup|\bgit\b|npm|yarn|pnpm|babel|eslint|cicd|\bci\b|jenkins|docker|tree.?shaking|hmr|source.?map/i],
  ['浏览器', /浏览器|dom\b|\bbom\b|事件|渲染|重排|重绘|cookie|localstorage|sessionstorage|存储|history|hash/i],
  ['网络', /http|https|tcp|udp|dns|跨域|缓存|websocket|\bcdn\b|状态码|get\s*.{0,4}post|请求|响应|osi|cdn|keep-alive/i],
  ['性能优化', /性能|优化|加载|白屏|首屏|lazy|懒加载|预加载|重排|repaint|回流/i],
  ['安全', /xss|csrf|安全|攻击|加密|劫持|注入/i],
  ['手写题', /手写|实现一?[个次]|new\s*操作符|call|apply|bind|promise|防抖|节流|深拷贝|浅拷贝|继承|原型链|发布订阅|事件总线/i],
  ['Node', /\bnode\b|express|koa|ssr|服务端渲染|中间件|stream/i],
  ['CSS', /css|flex|grid|布局|选择器|盒模型|\brem\b|\bem\b|sass|less|动画|定位|z-index|bfc|层叠/i],
  ['HTML', /html|语义化|meta|doctype|标签|src|href/i],
];
function guessCat(q) {
  for (const [cat, re] of CAT_RULES) if (re.test(q)) return cat;
  return 'JavaScript';
}

// ---------- HTML 解析（正则，零依赖） ----------
function decodeHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function parsePage(html) {
  // 题号与题型：<div class="subject-item answer-primary-mod"> 1 问答题 1 / 464 <标题>
  const head = /subject-item[^>]*>([\s\S]*?)<(?:div|p)\s+class="(?:result|question)/i.exec(html);
  // 标题：title 标签最可靠（"题目?_前端校招面试题目合集_牛客网"）
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!t) return null;
  const title = decodeHtml(t[1]).replace(/_前端校招面试题目合集_牛客网\s*$/, '').trim();
  // 序号：subject-item 区域里的 "N 问答题 N / 464"
  const sec = /subject-item[\s\S]{0,300}?(\d+)\s*问答题\s*(\d+)\s*\/\s*(\d+)/i.exec(html);
  // 参考答案：design-answer-box
  const ans = /design-answer-box[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!title || !ans) return null;
  return {
    no: sec ? +sec[2] : 0,
    total: sec ? +sec[3] : 0,
    q: title,
    a: decodeHtml(ans[1]),
  };
}

async function fetchPage(page) {
  const url = BASE + page;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// ---------- 主流程 ----------
(async () => {
  const t0 = Date.now();
  info(`抓取范围：第 ${opt.from}-${opt.to} 题，间隔 ${opt.delay}ms，模式 ${opt.keepExisting ? '合并' : '全量重建'}`);

  // 旧数据（保留本地进度）
  let oldBank = { questions: [] };
  try { oldBank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')); } catch (e) { /* 首次 */ }
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); } catch (e) { /* 首次 */ }
  const oldById = new Map();
  for (const q of (oldBank.questions || [])) oldById.set(q.id, q);

  const list = [];
  const seen = new Set();   // 题目标题去重（合集内可能有重复题）
  let fetched = 0, failed = 0, skippedDup = 0;
  const catStat = {};

  for (let p = opt.from; p <= opt.to; p++) {
    let item = null;
    for (let attempt = 1; attempt <= 3 && !item; attempt++) {
      try {
        const html = await fetchPage(p);
        item = parsePage(html);
        if (item && item.total && item.total !== opt.to && p === opt.from) {
          info(`牛客题库总数已变为 ${item.total}（脚本默认 ${opt.to}），按实际总数调整`);
          opt.to = Math.max(opt.to, item.total);
        }
      } catch (e) {
        if (attempt === 3) { info(`第 ${p} 页抓取失败：${e.message}`); failed++; }
        else await sleep(2000 * attempt);
      }
    }
    if (!item || !item.q || item.q.length < 4) { if (!item) failed++; continue; }
    if (seen.has(item.q)) { skippedDup++; continue; }
    seen.add(item.q);
    fetched++;

    const id = 'nc_' + (item.no || p);
    const cat = guessCat(item.q);
    catStat[cat] = (catStat[cat] || 0) + 1;
    const prev = oldById.get(id) || {};
    const prog = progress[id] || {};
    list.push({
      id, no: item.no || p, cat, q: item.q, a: item.a,
      url: BASE + (item.no || p),
      source: 'nowcoder',
      fetchedAt: new Date().toISOString(),
      mastery: prog.mastery != null ? prog.mastery : (prev.mastery || 0),
      starred: prog.starred != null ? prog.starred : (prev.starred || false),
    });
    if (fetched % 25 === 0) info(`进度 ${fetched}/${opt.to - opt.from + 1}…`);
    if (p < opt.to) await sleep(opt.delay);
  }

  // 合并模式：保留范围内之外的旧题
  if (opt.keepExisting) {
    const inRange = new Set(list.map(x => x.id));
    for (const q of (oldBank.questions || [])) if (!inRange.has(q.id)) list.push(q);
    list.sort((a, b) => a.no - b.no);
  }

  const bank = {
    updatedAt: new Date().toISOString(),
    source: 'nowcoder · 前端校招面试题目合集',
    sourceUrl: 'https://www.nowcoder.com/ta/review-frontend',
    total: list.length,
    catStat,
    questions: list,
  };
  fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 1), 'utf8');

  // 进度镜像写回 quiz_progress.json
  const progOut = {};
  for (const q of list) if (q.mastery || q.starred) progOut[q.id] = { mastery: q.mastery || 0, starred: !!q.starred };
  fs.writeFileSync(PROG_FILE, JSON.stringify(progOut, null, 1), 'utf8');

  const durationMs = Date.now() - t0;
  info(`完成：抓取 ${fetched} 题（失败 ${failed}，重复跳过 ${skippedDup}），题库共 ${list.length} 题，耗时 ${(durationMs / 1000).toFixed(0)}s`);
  info('分类分布：' + Object.entries(catStat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(JSON.stringify({ ok: true, fetched, failed, skippedDup, total: list.length, catStat, durationMs }));
})().catch(e => {
  console.error('[nowcoder] 致命错误：' + e.message);
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});

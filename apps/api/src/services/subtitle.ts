import fs from 'node:fs';
import path from 'node:path';

/* ============================================================
 * subtitle.ts — 字幕工具箱（纯函数 + 文件操作）
 *  - SRT ↔ VTT 互转
 *  - 时间轴整体移位（±秒）
 *  - GBK/Big5 → UTF-8 编码修复
 *  - 字幕按视频名批量改名（先预览后执行）
 * ============================================================ */

const SUB_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.rmvb'];

export function isSubExt(ext: string): boolean {
  return SUB_EXTS.includes(ext.toLowerCase());
}
export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.includes(ext.toLowerCase());
}

/* ---------- 时间轴 ---------- */

export function parseTime(t: string): number {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/.exec(t.trim());
  if (!m) return 0;
  const ms = +(m[4].padEnd(3, '0'));
  return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + ms / 1000;
}

export function fmtTime(sec: number, comma = true): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(ss)}${comma ? ',' : '.'}${p(ms, 3)}`;
}

/** 整体移位：>0 延后，<0 提前 */
export function shiftSubtitle(text: string, seconds: number): string {
  const re = /(\d{1,2}:\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[.,]\d{1,3})/g;
  return text.replace(re, (_m, a: string, b: string) => {
    const comma = a.includes(',');
    return `${fmtTime(parseTime(a) + seconds, comma)} --> ${fmtTime(parseTime(b) + seconds, comma)}`;
  });
}

/* ---------- SRT ↔ VTT ---------- */

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r/g, '')
    .replace(/(\d{1,2}:\d{1,2}:\d{1,2}),(\d{1,3})/g, '$1.$2')
    .replace(/^\d+\s*\n/gm, '')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

export function vttToSrt(vtt: string): string {
  const lines = vtt.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let idx = 1;
  let i = 0;
  // 跳过 WEBVTT 头与 NOTE/STYLE 块
  while (i < lines.length && !/\d{1,2}:\d{1,2}:\d{1,2}/.test(lines[i])) i++;
  let block: string[] = [];
  const flush = () => {
    if (!block.length) return;
    const text = block.join('\n').replace(/(\d{1,2}:\d{1,2}:\d{1,2})\.(\d{1,3})/g, '$1,$2');
    out.push(String(idx++), text, '');
    block = [];
  };
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '') flush();
    else block.push(lines[i]);
  }
  flush();
  return out.join('\n');
}

/* ---------- 编码修复 ---------- */

/** 判断 Buffer 是否合法 UTF-8（中文常见假阳性用 BOM/连续校验兜底） */
export function looksUtf8(buf: Buffer): boolean {
  try {
    const txt = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return !txt.includes('\uFFFD');
  } catch {
    return false;
  }
}

export function decodeSmart(buf: Buffer): { text: string; from: string } {
  if (looksUtf8(buf)) return { text: buf.toString('utf8').replace(/^\uFEFF/, ''), from: 'utf-8' };
  for (const enc of ['gbk', 'big5']) {
    try {
      const txt = new TextDecoder(enc, { fatal: false }).decode(buf);
      // GBK 解码若出现大量替换符则放弃
      const bad = (txt.match(/\uFFFD/g) || []).length;
      if (bad <= txt.length * 0.01) return { text: txt, from: enc };
    } catch { /* try next */ }
  }
  return { text: buf.toString('utf8'), from: 'utf-8(原样)' };
}

/* ---------- 智能改名 ---------- */

/** 去掉分辨率 / 压制组 / 常见标签，便于与视频名比对 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[. _-]*(1080p|720p|480p|2160p|4k|hdtv|webrip|web-?dl|bluray|bdrip|dvdrip|h264|h265|hevc|x264|x265|aac|ac3|mp3|chs|cht|eng|jpn|简体|繁体|中字|中英|双字|字幕组|修正|高清|国语|粤语|内嵌|外挂)/gi, '')
    .replace(/[.\-_]+/g, '')
    .replace(/[\s（）()【】\[\]]+/g, '')
    .trim();
}

export interface RenamePair {
  sub: string;
  video: string;
  target: string;
  ok: boolean;
  reason?: string;
}

/** 生成「字幕 → 视频」配对方案（不落盘） */
export function planRename(subFiles: string[], videoFiles: string[]): RenamePair[] {
  const vmap = videoFiles.map((v) => ({ raw: v, key: normalizeName(path.basename(v, path.extname(v))) }));
  const used = new Set<string>();
  const pairs: RenamePair[] = [];
  for (const sub of subFiles) {
    const subBase = path.basename(sub, path.extname(sub));
    const skey = normalizeName(subBase);
    // 1) 视频名被字幕名包含（或反之）→ 最强匹配
    let hit = vmap.find((v) => !used.has(v.raw) && (skey.includes(v.key) || v.key.includes(skey)) && v.key.length >= 2);
    // 2) 数字编号前缀匹配（S01E01 / 01）
    if (!hit) {
      const num = /(\d{1,3})/.exec(subBase.replace(/^\D+/, ''));
      if (num) hit = vmap.find((v) => !used.has(v.raw) && new RegExp(`(^|\\D)${num[1]}(\\D|$)`).test(path.basename(v.raw)));
    }
    if (hit) {
      used.add(hit.raw);
      pairs.push({ sub, video: hit.raw, target: path.join(path.dirname(sub), path.basename(hit.raw, path.extname(hit.raw)) + path.extname(sub)), ok: true });
    } else {
      pairs.push({ sub, video: '', target: '', ok: false, reason: '未找到匹配视频' });
    }
  }
  return pairs;
}

/** 列出目录下指定扩展名文件 */
export function listByExt(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isFile() && exts.includes(path.extname(name).toLowerCase())) out.push(full);
    } catch { /* skip */ }
  }
  return out.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

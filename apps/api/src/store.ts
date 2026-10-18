import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');

export function readJson<T>(file: string, fallback: T): T {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    const txt = fs.readFileSync(p, 'utf8').trim();
    if (!txt) return fallback;
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

/** 原子写：先写 .tmp 再 rename，避免进程中断写出半个 JSON */
export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const p = path.join(DATA_DIR, file);
  fs.mkdirSync(path.dirname(p), { recursive: true }); // 支持子目录（如 work/jobs.json）
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

export function uid(prefix = ''): string {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/** 中文标题转 slug：保留中文（读起来更友好），空格转 - */
export function slugify(input: string): string {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'post';
}

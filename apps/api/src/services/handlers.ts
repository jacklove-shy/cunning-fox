import fs from 'node:fs';
import path from 'node:path';
import { runProc, guardPath, workDirFor, type JobCtx, type JobResult, handlers } from './toolkit.js';
import { findPython } from './toolkit.js';
import { presetById, runFfmpeg, probeDuration, delogoVideo } from './media.js';
import { decodeSmart, srtToVtt, vttToSrt, shiftSubtitle, listByExt, isSubExt, isVideoExt, planRename } from './subtitle.js';

/* ============================================================
 * handlers.ts — 每个工具一个处理器（跑在任务队列里）
 * 输入路径全部过 guardPath 守卫；输出目录建在输入同级，方便用户找
 * ============================================================ */

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 为一批输入文件准备同一个输出目录：<第一个文件所在目录>/<标签>_<时间戳>/ */
function makeOutDir(files: string[], label: string): string {
  const base = path.dirname(guardPath(files[0]) || process.cwd());
  const dir = path.join(base, `${label}_${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statFile(p: string): { name: string; path: string; size: number } {
  return { name: path.basename(p), path: p, size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
}

function guardedAll(files: unknown): string[] {
  const out: string[] = [];
  for (const f of Array.isArray(files) ? files : []) {
    const g = guardPath(String(f));
    if (g && fs.existsSync(g)) out.push(g);
  }
  return out;
}

/* ---------------- 图片去水印（Pillow） ---------------- */

handlers['img-dewatermark'] = async (params, ctx: JobCtx): Promise<JobResult> => {
  const files = guardedAll(params.files).filter((f) => /\.(png|jpe?g|webp|bmp)$/i.test(f));
  if (!files.length) throw new Error('没有有效的图片文件（支持 png/jpg/webp/bmp）');
  const py = findPython();
  if (!py) throw new Error('未找到 Python（用于 Pillow 图像处理）');
  const outDir = makeOutDir(files, '图片去水印输出');
  ctx.log(`共 ${files.length} 张图片，模式 ${params.mode || 'smart'}，输出目录 ${outDir}`);
  const { promise, kill } = runProc(py, [
    path.join(process.cwd(), 'scripts', 'img_clean.py'),
    '--params', JSON.stringify({ files, mode: params.mode || 'smart', rect: params.rect, color: params.color || '#ffffff', outDir }),
  ], {
    timeoutMs: 30 * 60 * 1000,
    onStdout: (line) => {
      const m = /^PROGRESS\s+(\d+)\s+(.*)$/.exec(line);
      if (m) {
        ctx.setProgress(+m[1]);
        ctx.log(m[2]);
      } else if (/^RESULT\s+/.test(line)) {
        try {
          const r = JSON.parse(line.slice(7));
          ctx.log(`Pillow 完成：成功 ${r.ok}，失败 ${r.failed}`);
          if (r.errors?.length) ctx.log('失败明细：' + r.errors.map((e: { error: string }) => e.error).join('；').slice(0, 300));
        } catch { /* ignore */ }
      } else if (line.trim()) ctx.log(line);
    },
  });
  ctx.track(kill);
  const r = await promise;
  if (r.code !== 0) throw new Error('图片处理失败：' + (r.stderr || r.stdout).slice(0, 300));
  const outs = fs.readdirSync(outDir).map((n) => statFile(path.join(outDir, n)));
  return { files: outs, outDir, summary: `${outs.length} 张图片已处理` };
};

/* ---------------- 视频转码 ---------------- */

handlers['video-transcode'] = async (params, ctx: JobCtx): Promise<JobResult> => {
  const files = guardedAll(params.files).filter((f) => /\.(mp4|mov|mkv|avi|wmv|flv|webm|ts|m4v)$/i.test(f));
  if (!files.length) throw new Error('没有有效的视频文件');
  const preset = presetById(String(params.preset || 'h264'));
  if (!preset) throw new Error('未知转码预设：' + params.preset);
  const outDir = makeOutDir(files, `视频转码_${preset.id}`);
  const outs: { name: string; path: string; size: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    ctx.checkAborted();
    const out = path.join(outDir, path.basename(f, path.extname(f)) + preset.ext);
    const dur = await probeDuration(f);
    await runFfmpeg({ ctx, input: f, output: out, args: preset.args(f, out), duration: dur });
    outs.push(statFile(out));
    ctx.setProgress(((i + 1) / files.length) * 100);
  }
  return { files: outs, outDir, summary: `${outs.length} 个视频已转码（${preset.name}）` };
};

/* ---------------- 视频去水印（ffmpeg delogo） ---------------- */

handlers['video-dewatermark'] = async (params, ctx: JobCtx): Promise<JobResult> => {
  const files = guardedAll(params.files).filter((f) => /\.(mp4|mov|mkv|avi|webm|ts)$/i.test(f));
  if (!files.length) throw new Error('没有有效的视频文件');
  const rect = params.rect as { x: number; y: number; w: number; h: number } | undefined;
  if (!rect || rect.w < 0.005 || rect.h < 0.005) throw new Error('请先框选水印区域');
  const outDir = makeOutDir(files, '视频去水印输出');
  const outs: { name: string; path: string; size: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    ctx.checkAborted();
    const { out } = await delogoVideo(files[i], rect, outDir, ctx);
    outs.push(statFile(out));
    ctx.setProgress(((i + 1) / files.length) * 100);
  }
  return { files: outs, outDir, summary: `${outs.length} 个视频已去水印` };
};

/* ---------------- 字幕工具箱 ---------------- */

handlers['subtitle'] = async (params, ctx: JobCtx): Promise<JobResult> => {
  const op = String(params.op || '');
  const dir = guardPath(String(params.dir || ''));
  if (!dir || !fs.statSync(dir).isDirectory()) throw new Error('目录无效或不在允许范围内');
  const subs = listByExt(dir, ['.srt', '.vtt', '.ass', '.ssa']);
  if (!subs.length) throw new Error('该目录下没有字幕文件（srt/vtt/ass/ssa）');
  const outDir = makeOutDir(subs, `字幕处理_${op}`);
  const outs: { name: string; path: string; size: number }[] = [];
  const shiftSec = Number(params.shiftSeconds || 0);

  for (let i = 0; i < subs.length; i++) {
    ctx.checkAborted();
    const f = subs[i];
    const base = path.basename(f);
    const ext = path.extname(f).toLowerCase();
    let text = '';
    let outName: string;
    if (op === 'rename') {
      // rename 由路由层预览确认后调用：params.pairs = [{sub, target}]
      const pairs = (params.pairs as { sub: string; target: string }[]) || [];
      const pair = pairs.find((p) => p.sub === f);
      if (!pair) continue;
      outName = path.basename(pair.target);
    } else if (op === 'srt2vtt' || op === 'vtt2srt') {
      // 已是目标格式的直接跳过，避免重复转换
      const targetExt = op === 'srt2vtt' ? '.vtt' : '.srt';
      if (ext === targetExt) {
        ctx.log(`${base} 已是 ${targetExt}，跳过`);
        ctx.setProgress(((i + 1) / subs.length) * 100);
        continue;
      }
      const buf = fs.readFileSync(f);
      const { text: t } = decodeSmart(buf);
      text = op === 'srt2vtt' ? srtToVtt(t) : vttToSrt(t);
      outName = path.basename(f, ext) + targetExt;
    } else if (op === 'fix-encoding') {
      const buf = fs.readFileSync(f);
      const { text: t, from } = decodeSmart(buf);
      text = t.replace(/^\uFEFF/, '');
      outName = path.basename(f, ext) + '_utf8' + ext;
      if (from.startsWith('utf-8')) {
        ctx.log(`${base} 已是 UTF-8，跳过`);
        ctx.setProgress(((i + 1) / subs.length) * 100);
        continue;
      }
      ctx.log(`${base}：${from} → UTF-8`);
    } else if (op === 'shift') {
      const buf = fs.readFileSync(f);
      const { text: t } = decodeSmart(buf);
      text = shiftSubtitle(t, shiftSec);
      outName = path.basename(f, ext) + `_${shiftSec >= 0 ? '+' : ''}${shiftSec}s` + ext;
    } else {
      throw new Error('未知字幕操作：' + op);
    }
    const dst = path.join(outDir, outName);
    if (op === 'rename') {
      fs.copyFileSync(f, dst);
    } else {
      fs.writeFileSync(dst, text, 'utf8');
    }
    outs.push(statFile(dst));
    ctx.log(`${base} → ${outName}`);
    ctx.setProgress(((i + 1) / subs.length) * 100);
  }
  if (!outs.length) throw new Error('没有可处理的文件（改名操作请先在预览中确认配对）');
  return { files: outs, outDir, summary: `${outs.length} 个字幕文件已处理（${op}）` };
};

/* ---------------- 牛客题库同步 ---------------- */

handlers['nowcoder-sync'] = async (params, ctx: JobCtx): Promise<JobResult> => {
  const from = Math.max(1, Number(params.from) || 1);
  const to = Math.max(from, Math.min(464, Number(params.to) || 50));
  const delay = Math.max(300, Number(params.delay) || 800);
  const script = path.join(process.cwd(), 'scripts', 'nowcoder_sync.cjs');
  if (!fs.existsSync(script)) throw new Error('同步脚本缺失：' + script);
  ctx.log(`抓取牛客题 ${from}–${to}，间隔 ${delay}ms（只读，不动牛客数据）`);
  const { promise, kill } = runProc(process.execPath, [
    script, '--from', String(from), '--to', String(to), '--delay', String(delay), '--keep-existing',
  ], {
    timeoutMs: 30 * 60 * 1000,
    onStdout: (line) => {
      ctx.log(line.replace(/^\[nowcoder\]\s*/, ''));
      const m = /题?\s*(\d+)\s*[\/-]/.exec(line);
      if (m) ctx.setProgress(((+m[1] - from) / Math.max(1, to - from + 1)) * 100);
    },
  });
  ctx.track(kill);
  const r = await promise;
  if (r.code !== 0) throw new Error('同步失败：' + (r.stderr || r.stdout).slice(0, 300));
  ctx.setProgress(100);
  // 读回题库统计（文件为 { questions: [...] } 结构）
  const bankPath = path.join(process.cwd(), 'data', 'question_bank.json');
  let total = 0;
  try {
    const raw = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    total = Array.isArray(raw) ? raw.length : (raw.questions || []).length;
  } catch { /* ignore */ }
  ctx.log(`题库现有 ${total} 题`);
  return { summary: `同步完成，题库共 ${total} 题`, data: { total } };
};

/* ---------------- 工具目录名（供前端展示输出位置） ---------------- */
export const TOOL_LABELS: Record<string, string> = {
  'img-dewatermark': '图片去水印输出',
  'video-transcode': '视频转码输出',
  'video-dewatermark': '视频去水印输出',
  subtitle: '字幕处理输出',
};

export { workDirFor, isSubExt, isVideoExt, planRename };

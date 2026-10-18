import fs from 'node:fs';
import path from 'node:path';
import { findFfmpeg, findFfprobe, runProc, type JobCtx } from './toolkit.js';

/* ============================================================
 * media.ts — ffmpeg / ffprobe 封装：转码、去水印（delogo）
 * 进度通过解析 stderr 的 time= 与 ffprobe 时长比对得出
 * ============================================================ */

export interface Preset {
  id: string;
  name: string;
  desc: string;
  ext: string;
  args: (src: string, dst: string) => string[];
}

export const TRANSCODE_PRESETS: Preset[] = [
  {
    id: 'h264',
    name: 'MP4 · H.264 通用',
    desc: '兼容性最好，体积适中，适合全网播放',
    ext: '.mp4',
    args: (src, dst) => ['-i', src, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', dst],
  },
  {
    id: 'compress',
    name: 'MP4 · 极限压缩',
    desc: 'CRF 28 + slow，同画质下体积最小，耗时更长',
    ext: '.mp4',
    args: (src, dst) => ['-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-y', dst],
  },
  {
    id: 'scale720',
    name: 'MP4 · 压缩到 720P',
    desc: '等比缩到 720 高，手机观看 / 发微信群刚好',
    ext: '.mp4',
    args: (src, dst) => ['-i', src, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-y', dst],
  },
  {
    id: 'gif',
    name: 'GIF 动图',
    desc: '12fps 宽 480，适合做表情包 / 演示片段',
    ext: '.gif',
    args: (src, dst) => ['-i', src, '-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0', '-y', dst],
  },
  {
    id: 'audio',
    name: '提取音频 MP3',
    desc: '丢弃画面，导出高质量 MP3',
    ext: '.mp3',
    args: (src, dst) => ['-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', '-y', dst],
  },
  {
    id: 'webm',
    name: 'WebM · VP9',
    desc: '网页嵌入体积最小，现代浏览器通用',
    ext: '.webm',
    args: (src, dst) => ['-i', src, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libvorbis', '-y', dst],
  },
];

export function presetById(id: string): Preset | undefined {
  return TRANSCODE_PRESETS.find((p) => p.id === id);
}

/** 用 ffprobe 取时长（秒），失败返回 null */
export async function probeDuration(file: string): Promise<number | null> {
  const ffprobe = findFfprobe();
  if (!ffprobe) return null;
  const r = await runProc(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { timeoutMs: 15000 }).promise;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTimeToSec(t: string): number {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

export interface FfmpegRunOpts {
  ctx: JobCtx;
  input: string;
  output: string;
  args: string[];
  /** 进度换算的总时长（秒） */
  duration?: number | null;
}

/** 跑一次 ffmpeg，把 stderr 关键行进日志、time= 换算成进度 */
export async function runFfmpeg(o: FfmpegRunOpts): Promise<void> {
  const ff = findFfmpeg();
  if (!ff) throw new Error('未找到 ffmpeg：请在工具页「环境检测」里配置路径（默认 E:\\WorkBuddy\\tools\\ffmpeg\\bin\\ffmpeg.exe）');
  const { ctx } = o;
  ctx.log(`ffmpeg ${path.basename(o.input)} → ${path.basename(o.output)}`);
  const { promise, kill } = runProc(ff, o.args, {
    timeoutMs: 60 * 60 * 1000,
    onStderr: (line) => {
      const tm = /time=(\d+:\d+:\d+(?:\.\d+)?)/.exec(line);
      if (tm && o.duration) {
        ctx.setProgress((parseTimeToSec(tm[1]) / o.duration) * 100);
      }
      if (/(error|invalid|failed|cannot)/i.test(line) && line.trim()) ctx.log('ffmpeg: ' + line.trim().slice(0, 160));
    },
  });
  ctx.track(kill);
  const r = await promise;
  if (r.timedOut) throw new Error('ffmpeg 执行超时（1 小时）');
  if (r.code !== 0) throw new Error('ffmpeg 退出码 ' + r.code + '：' + (r.stderr || '').split('\n').slice(-3).join(' ').slice(0, 300));
  if (!fs.existsSync(o.output)) throw new Error('ffmpeg 执行结束但未生成输出文件');
  const sz = (fs.statSync(o.output).size / 1024 / 1024).toFixed(1);
  ctx.log(`生成 ${path.basename(o.output)}（${sz} MB）`);
}

/** 视频去水印：delogo 区域抹除 */
export async function delogoVideo(
  file: string,
  rect: { x: number; y: number; w: number; h: number },
  outDir: string,
  ctx: JobCtx,
): Promise<{ out: string }> {
  const ff = findFfmpeg();
  if (!ff) throw new Error('未找到 ffmpeg');
  // 用 ffprobe 取分辨率，把归一化矩形换算成像素
  const ffprobe = findFfprobe();
  let W = 0;
  let H = 0;
  if (ffprobe) {
    const r = await runProc(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { timeoutMs: 15000 }).promise;
    const m = /(\d+),(\d+)/.exec(r.stdout);
    if (m) { W = +m[1]; H = +m[2]; }
  }
  if (!W || !H) throw new Error('无法读取视频分辨率（ffprobe 失败）');
  const x = Math.round(rect.x * W);
  const y = Math.round(rect.y * H);
  const w = Math.max(8, Math.round(rect.w * W));
  const h = Math.max(8, Math.round(rect.h * H));
  ctx.log(`分辨率 ${W}x${H}，抹除区域 x=${x} y=${y} w=${w} h=${h}`);
  const base = path.basename(file, path.extname(file));
  const out = path.join(outDir, `${base}_clean.mp4`);
  await runFfmpeg({
    ctx,
    input: file,
    output: out,
    args: ['-i', file, '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-y', out],
    duration: await probeDuration(file),
  });
  return { out };
}

import { useState } from 'react';
import { JobPanel, PathBrowser, RegionPicker, EnvBadge, useEnv, useToolJob, type Rect } from '../runtime';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';
const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.ts'];

/** 视频去水印：ffmpeg delogo 区域抹除，框选一个视频的区域应用到全部 */
export function VideoDewatermark() {
  const env = useEnv();
  const { job, start, cancel, reset, busy, error } = useToolJob('video-dewatermark');
  const [files, setFiles] = useState<string[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  const preview = files[previewIdx] || '';
  const previewable = /\.(mp4|webm|mov)$/i.test(preview); // mkv/avi 浏览器不能播，仍可处理

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold muted">1 · 选择视频（本地目录多选）</span>
          <EnvBadge env={env} />
        </div>
        <PathBrowser value={files} onChange={(v) => { setFiles(v); setPreviewIdx(0); setRect(null); }} exts={VIDEO_EXTS} />
        {preview && (
          <>
            <div className="mt-3 flex items-center gap-2 text-[11px] muted">
              <span>预览：{preview.split(/[\\/]/).pop()}</span>
              {files.length > 1 && (
                <span className="ml-auto flex gap-1">
                  <button className="btn sm !py-0 !text-[11px]" onClick={() => { setPreviewIdx((i) => (i - 1 + files.length) % files.length); setRect(null); }}>← 上一个</button>
                  <span>{previewIdx + 1}/{files.length}</span>
                  <button className="btn sm !py-0 !text-[11px]" onClick={() => { setPreviewIdx((i) => (i + 1) % files.length); setRect(null); }}>下一个 →</button>
                </span>
              )}
            </div>
            <div className="mt-2">
              {previewable ? (
                <RegionPicker rect={rect} onChange={setRect} hint="播放/暂停后，在画面上按住拖动框住水印（同一区域应用到所有选中视频）">
                  <video key={preview} src={`${BASE}/toolkit/raw?path=${encodeURIComponent(preview)}`} controls
                    style={{ maxWidth: '100%', maxHeight: 380, display: 'block' }} />
                </RegionPicker>
              ) : (
                <div className="rounded-lg p-4 text-center text-[12px] muted" style={{ background: 'var(--chip-bg, #f6f7f9)' }}>
                  {preview.split(/[\\/]/).pop()} 格式浏览器不能预览（mkv/avi），但仍会按 ffmpeg 处理。
                  <br />建议切到 mp4/webm 文件预览框选，或用下一个按钮切换。
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card p-4">
        <span className="text-xs font-semibold muted">2 · 执行</span>
        <p className="muted mt-1 text-[11px] leading-relaxed">
          用 ffmpeg <span className="font-mono">delogo</span> 滤镜抹除框选区域，重新编码为 H.264（CRF 20，画质损失极小）。
          水印位置固定的片头/角标效果最好；半透明滚动水印建议先用转码工具裁剪或分段处理。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn primary" disabled={!files.length || !rect || rect.w < 0.005 || busy} onClick={() => start({ files, rect })}>
            {busy ? '提交中…' : `开始处理 ${files.length || ''} 个视频`}
          </button>
          {files.length > 0 && !rect && <span className="text-[11px] muted">先在预览画面上框选水印区域</span>}
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{error}</p>}
      </div>

      <JobPanel job={job} onCancel={cancel} onReset={reset} />
    </div>
  );
}

import { useState } from 'react';
import { JobPanel, PathBrowser, RegionPicker, EnvBadge, useEnv, useToolJob, type Rect } from '../runtime';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';
const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

/** 图片批量去水印：本地选图 → 预览框选 → 三种模式 → 输出到「图片去水印输出_时间戳」 */
export function ImgDewatermark() {
  const env = useEnv();
  const { job, start, cancel, reset, busy, error } = useToolJob('img-dewatermark');
  const [files, setFiles] = useState<string[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mode, setMode] = useState<'smart' | 'blur' | 'cover'>('smart');
  const [color, setColor] = useState('#ffffff');
  const [previewIdx, setPreviewIdx] = useState(0);

  const preview = files[previewIdx] || files[0] || '';
  const canRun = files.length > 0 && rect && rect.w > 0.005 && rect.h > 0.005;

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold muted">1 · 选择图片（本地目录多选）</span>
          <EnvBadge env={env} />
        </div>
        <PathBrowser value={files} onChange={(v) => { setFiles(v); setPreviewIdx(0); setRect(null); }} exts={IMG_EXTS} />
        {preview && (
          <>
            <div className="mt-3 flex items-center gap-2 text-[11px] muted">
              <span>预览：{preview.split(/[\\/]/).pop()}</span>
              {files.length > 1 && (
                <span className="ml-auto flex gap-1">
                  <button className="btn sm !py-0 !text-[11px]" onClick={() => { setPreviewIdx((i) => (i - 1 + files.length) % files.length); setRect(null); }}>← 上一张</button>
                  <span>{previewIdx + 1}/{files.length}</span>
                  <button className="btn sm !py-0 !text-[11px]" onClick={() => { setPreviewIdx((i) => (i + 1) % files.length); setRect(null); }}>下一张 →</button>
                </span>
              )}
            </div>
            <div className="mt-2">
              <RegionPicker rect={rect} onChange={setRect} hint="在预览图上按住拖动，框住水印区域（同一区域会应用到所有选中图片）">
                <img src={`${BASE}/toolkit/raw?path=${encodeURIComponent(preview)}`} alt="预览"
                  style={{ maxWidth: '100%', maxHeight: 380, display: 'block' }} />
              </RegionPicker>
            </div>
          </>
        )}
      </div>

      <div className="card p-4">
        <span className="text-xs font-semibold muted">2 · 处理模式</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([
            ['smart', '智能', '纯色/渐变背景→四周取样延展填充（近乎无痕）；复杂背景→强模糊'],
            ['blur', '模糊', '高斯模糊整块区域，快但留雾感'],
            ['cover', '纯色覆盖', '用指定颜色盖住，适合白底黑字水印'],
          ] as const).map(([id, name, desc]) => (
            <button key={id} className="rounded-lg p-2.5 text-left" onClick={() => setMode(id)}
              style={{
                border: `1.5px solid ${mode === id ? 'var(--accent, #ef7d3a)' : 'var(--line, #e5e7eb)'}`,
                background: mode === id ? 'var(--chip-bg, #fff7ef)' : 'transparent',
              }}>
              <div className="text-[13px] font-semibold">{name}</div>
              <div className="muted mt-0.5 text-[11px] leading-relaxed">{desc}</div>
            </button>
          ))}
        </div>
        {mode === 'cover' && (
          <label className="mt-2 flex items-center gap-2 text-xs muted">
            填充色
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 26, border: 'none', background: 'none' }} />
            <span className="font-mono">{color}</span>
          </label>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn primary" disabled={!canRun || busy} onClick={() => start({ files, mode, rect, color })}>
            {busy ? '提交中…' : `开始处理 ${files.length} 张图片`}
          </button>
          {!canRun && <span className="text-[11px] muted">{files.length === 0 ? '先选图片' : '先在预览图上框选水印区域'}</span>}
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{error}</p>}
      </div>

      <JobPanel job={job} onCancel={cancel} onReset={reset} />

      <p className="text-[11px] muted">
        说明：输出保存在第一张图片同级目录的「图片去水印输出_时间戳」文件夹，原图不动。水印压在复杂画面上的「完全无痕」需要 PS 级修复，这里提供的是够用的批量方案。
      </p>
    </div>
  );
}

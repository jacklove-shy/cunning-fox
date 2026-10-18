import { useState } from 'react';
import { JobPanel, PathBrowser, EnvBadge, useEnv, useToolJob } from '../runtime';

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.avi', '.wmv', '.flv', '.webm', '.ts', '.m4v'];

/** 视频转码：ffmpeg 预设，本地选文件 → 队列执行 → 输出到「视频转码_预设_时间戳」 */
export function VideoTranscode() {
  const env = useEnv();
  const { job, start, cancel, reset, busy, error } = useToolJob('video-transcode');
  const [files, setFiles] = useState<string[]>([]);
  const [preset, setPreset] = useState('h264');

  const presets = env?.presets || [];

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold muted">1 · 选择视频（本地目录多选）</span>
          <EnvBadge env={env} />
        </div>
        <PathBrowser value={files} onChange={setFiles} exts={VIDEO_EXTS} />
      </div>

      <div className="card p-4">
        <span className="text-xs font-semibold muted">2 · 转码预设</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <button key={p.id} className="rounded-lg p-2.5 text-left" onClick={() => setPreset(p.id)}
              style={{
                border: `1.5px solid ${preset === p.id ? 'var(--accent, #ef7d3a)' : 'var(--line, #e5e7eb)'}`,
                background: preset === p.id ? 'var(--chip-bg, #fff7ef)' : 'transparent',
              }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold">{p.name}</span>
                <span className="chip !py-0 !text-[11px]">{p.ext}</span>
              </div>
              <div className="muted mt-0.5 text-[11px] leading-relaxed">{p.desc}</div>
            </button>
          ))}
          {presets.length === 0 && <p className="muted text-xs">预设加载中（若长时间为空，检查 API 是否在线）…</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn primary" disabled={!files.length || busy} onClick={() => start({ files, preset })}>
            {busy ? '提交中…' : `开始转码 ${files.length || ''} 个视频`}
          </button>
          {!files.length && <span className="text-[11px] muted">先选视频文件</span>}
          {env && !env.ffmpeg.ok && <span className="text-[11px]" style={{ color: '#e5484d' }}>ffmpeg 未安装：下载静态版放到 E:\WorkBuddy\tools\ffmpeg\bin\ 后在设置里配置路径</span>}
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: '#e5484d' }}>{error}</p>}
      </div>

      <JobPanel job={job} onCancel={cancel} onReset={reset} />

      <p className="text-[11px] muted">
        说明：转码在服务端串行执行，页面可关闭（任务在跑，回来在「最近任务」看结果）；输出保存在第一个视频同级目录。GIF/VP9 耗时较长属正常。
      </p>
    </div>
  );
}

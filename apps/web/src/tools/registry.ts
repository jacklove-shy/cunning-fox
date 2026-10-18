import type { ComponentType } from 'react';
import { JsonTool } from './builtins/JsonTool';
import { PromptVault } from './builtins/PromptVault';
import { PageRuler } from './builtins/PageRuler';
import { Game2048 } from './builtins/Game2048';
import { SnakeGame } from './builtins/SnakeGame';
import { TypingTest } from './builtins/TypingTest';
import { VideoSearch } from './builtins/VideoSearch';
import { ImgDewatermark } from './builtins/ImgDewatermark';
import { VideoTranscode } from './builtins/VideoTranscode';
import { VideoDewatermark } from './builtins/VideoDewatermark';
import { SubtitleToolbox } from './builtins/SubtitleToolbox';
import { ResumePolish } from './builtins/ResumePolish';
import { NowcoderSync } from './builtins/NowcoderSync';
import { WeddingLedger } from './builtins/WeddingLedger';
import { DevToolbox } from './builtins/DevToolbox';
import { AutoApplyGuide } from './builtins/AutoApplyGuide';

/**
 * 工具注册表：决定每个工具"能不能用、怎么用"。
 * - builtin  ：站内运行时直接渲染（纯前端或本机服务端能力，均可用）
 * - external ：外链（我的项目 / 已部署系统），新窗口打开
 * - soon     ：仍需特定环境（如浏览器扩展），先展示说明
 */
export type ToolKind = 'builtin' | 'external' | 'soon';

export interface ToolDef {
  kind: ToolKind;
  run?: ComponentType;
  soonNote?: string;
  /** 相对外链同类工具的差异化卖点，展示在卡片上（不填则不展示） */
  edge?: string;
}

export const TOOL_REGISTRY: Record<string, ToolDef> = {
  // —— 纯前端即可用 ——
  'json-viewer': { kind: 'builtin', run: JsonTool, edge: '数据不出浏览器' },
  'prompt-vault': { kind: 'builtin', run: PromptVault, edge: '数据存本地' },
  'page-ruler': { kind: 'builtin', run: PageRuler, edge: '纯前端测量' },
  'game-2048': { kind: 'builtin', run: Game2048 },
  'snake-game': { kind: 'builtin', run: SnakeGame },
  'typing-test': { kind: 'builtin', run: TypingTest },
  'dev-toolbox': { kind: 'builtin', run: DevToolbox, edge: '数据不出浏览器' },
  'auto-apply-guide': { kind: 'builtin', run: AutoApplyGuide, edge: '读取本机状态' },

  // —— 本机服务端能力（API /api/toolkit/* 驱动，任务队列执行）——
  'video-search-hub': { kind: 'builtin', run: VideoSearch, edge: '聚合检索' },
  'img-dewatermark': { kind: 'builtin', run: ImgDewatermark, edge: '图片不出本机' },
  'video-transcode': { kind: 'builtin', run: VideoTranscode, edge: '视频不出本机' },
  'video-dewatermark': { kind: 'builtin', run: VideoDewatermark, edge: '视频不出本机' },
  'subtitle-batch': { kind: 'builtin', run: SubtitleToolbox, edge: '文件本机处理' },
  'resume-polish': { kind: 'builtin', run: ResumePolish, edge: '简历不出本机' },
  'nowcoder-sync': { kind: 'builtin', run: NowcoderSync, edge: '数据存本机' },
  'wedding-ledger': { kind: 'builtin', run: WeddingLedger, edge: '数据存本机' },

  // —— 外链（我的项目 / 已部署系统，保留原跳转）——
  'job-hunter-console': { kind: 'external' },
  'portfolio-site': { kind: 'external' },
  'nowcoder-project': { kind: 'external' },
  'qqbot': { kind: 'external' },
  'extensions': { kind: 'external' },
  'games': { kind: 'external' },

  // —— 仍需特定环境 ——
  'boss-helper': {
    kind: 'soon',
    soonNote: '这是 Chrome 扩展（MV3），只能在浏览器扩展环境里运行，无法搬进网页。安装入口见「我的项目 → 插件集」。',
  },
};

export function toolKind(slug: string): ToolKind {
  return TOOL_REGISTRY[slug]?.kind ?? 'external';
}

/** 取本地工具的差异化卖点文案；没有则返回空串（卡片不展示徽标） */
export function toolEdge(slug: string): string {
  return TOOL_REGISTRY[slug]?.edge ?? '';
}

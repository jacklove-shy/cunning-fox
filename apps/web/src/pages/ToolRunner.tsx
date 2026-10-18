import { Link, Navigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/api';
import type { Tool } from '../lib/types';
import { TOOL_REGISTRY, toolKind } from '../tools/registry';

/** 工具运行时：内置工具直接渲染，待上线工具展示说明，外链工具回列表 */
export default function ToolRunner() {
  const { slug = '' } = useParams();
  const { data, loading } = useApi<{ items: Tool[] }>('/tools');
  const tool = data?.items.find((t) => t.slug === slug);
  const def = TOOL_REGISTRY[slug];
  const kind = toolKind(slug);

  if (loading) {
    return <div className="wrap py-24 text-center muted">加载中…</div>;
  }
  if (!tool) {
    return (
      <div className="wrap max-w-xl py-24 text-center">
        <div className="card empty">未找到该工具。<Link to="/tools" className="btn sm mt-3">返回工具集市</Link></div>
      </div>
    );
  }
  if (kind === 'external' || !def) {
    return <Navigate to="/tools" replace />;
  }

  const Run = def.run;

  return (
    <div className="wrap max-w-4xl pt-8">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/tools" className="btn sm">← 工具集市</Link>
        <span className="text-2xl">{tool.icon || '🧰'}</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{tool.name}</h1>
          <p className="mt-0.5 text-[12.5px] muted">{tool.desc}</p>
        </div>
        <span className="chip ml-auto shrink-0 !py-0.5 text-[11px]">{tool.cat}</span>
      </div>

      {kind === 'builtin' && Run ? (
        <Run />
      ) : (
        <div className="card p-10 text-center">
          <div className="mb-3 text-4xl">🚧</div>
          <h2 className="text-lg font-bold">即将上线</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed muted">
            {def?.soonNote || '该工具依赖服务端能力，正在开发中。'}
          </p>
          <div className="mt-6 flex justify-center">
            <Link to="/tools" className="btn sm">看看别的工具</Link>
          </div>
        </div>
      )}
    </div>
  );
}

import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './services/auth.js';

/**
 * 管理员鉴权（旧接口：文章/工具/友链/配置）。
 * 同时兼容两套凭据，做到「全站一个登录」：
 *   1) 旧的单环境变量 token（ADMIN_TOKEN，向后兼容）；
 *   2) 新权限系统签发的 JWT（admin 角色，即右上角登录拿到的 token）。
 *
 * 安全说明：早期版本的兜底值是公开可猜的 'dev-token'，一旦开源等于
 * 把管理后台的钥匙挂在门口。这里改为——未配置 ADMIN_TOKEN 时，
 * 旧式 token 通道直接关闭（只剩 JWT 一条路），杜绝默认后门。
 * 需要兼容旧调用方时，显式设置 ADMIN_TOKEN=你的强口令。
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const got =
    (req.headers['x-admin-token'] as string | undefined) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (ADMIN_TOKEN && got === ADMIN_TOKEN) return next();
  // verifyToken 查 MySQL，是异步的：catch 转 next，别让 rejection 挂起请求
  verifyToken(got)
    .then((p) => {
      if (p && p.role === 'admin') return next();
      // 已登录但角色不足 → 403；完全没登录 / 凭据无效 → 401。
      // 区分这两者，前端才能正确决定「弹登录框」还是「提示无权限」。
      if (p) return res.status(403).json({ error: 'forbidden', hint: '该操作需要管理员权限' });
      return res.status(401).json({ error: 'unauthorized', hint: '请先在右上角登录（管理员）' });
    })
    .catch(next);
}

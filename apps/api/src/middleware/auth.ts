import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type Role } from '../services/auth.js';

/** 鉴权中间件：从 Authorization: Bearer <token> 解析并校验，可选限制角色。 */
export interface AuthedRequest extends Request {
  auth?: { sub: string; role: Role; exp: number };
}

export function requireAuth(role?: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return res.status(401).json({ error: '未登录或登录已失效' });
    const pay = verifyToken(m[1]);
    if (!pay) return res.status(401).json({ error: '令牌无效或已过期' });
    if (role === 'admin' && pay.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    req.auth = pay;
    next();
  };
}

import type { NextFunction, Request, Response } from 'express';

/**
 * async 路由处理器包装器。
 *
 * 背景：Express 4 不会自动捕获 async 函数里 rejection——
 * 一个没被 try/catch 兜住的 await 抛错，请求就永远挂起（客户端超时），
 * 错误也不会进统一错误中间件。这个包装把 rejection 转交 next(err)，
 * 让所有错误都走 index.ts 末尾的 JSON 错误出口。
 *
 * 用法：authRouter.post('/login', asyncHandler(async (req, res) => { ... }))
 */
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

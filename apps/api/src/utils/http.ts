import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, "BAD_REQUEST", m, d);
export const unauthorized = (m = "Authentication required") => new AppError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "You do not have permission to do that") => new AppError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new AppError(404, "NOT_FOUND", m);
export const conflict = (m: string) => new AppError(409, "CONFLICT", m);

/** Wrap async handlers so rejections reach the error middleware. */
export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export const ok = <T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
export const created = <T>(res: Response, data: T) => ok(res, data, undefined, 201);

/** Parse and return validated input or throw a 422 with field details. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError(422, "VALIDATION_ERROR", "Validation failed", r.error.flatten());
  return r.data;
}

export const pageParams = (q: Record<string, unknown>, defLimit = 12, maxLimit = 100) => {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || defLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
};
export const pageMeta = (total: number, page: number, limit: number) => ({ total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });

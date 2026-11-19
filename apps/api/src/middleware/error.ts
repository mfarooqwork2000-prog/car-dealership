import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { isProd } from "../config/env.js";
import { AppError } from "../utils/http.js";

export const notFoundHandler = (_req: Request, res: Response) =>
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof MulterError) {
    return res.status(400).json({ success: false, error: { code: "UPLOAD_ERROR", message: err.message } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ success: false, error: { code: "CONFLICT", message: `Duplicate value for ${(err.meta?.target as string[] | undefined)?.join(", ") ?? "unique field"}` } });
    if (err.code === "P2025") return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Record not found" } });
    if (err.code === "P2003") return res.status(409).json({ success: false, error: { code: "CONFLICT", message: "Record is referenced by other data" } });
  }
  if ((err as { type?: string })?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
  }
  console.error(err);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: isProd ? "Internal server error" : String((err as Error)?.message ?? err) } });
}

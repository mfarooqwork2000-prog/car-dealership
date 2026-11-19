import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ROLE_PERMISSIONS, type PermissionKey, type RoleKey } from "@cd/shared";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { forbidden, unauthorized } from "../utils/http.js";

export interface AuthUser {
  id: string;
  email: string;
  role: RoleKey;
  permissions: PermissionKey[];
  name: string;
}
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export const signAccessToken = (userId: string) => jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

/** Verifies bearer token and loads a fresh user (so deactivation / role changes apply immediately). */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    } catch {
      throw unauthorized("Invalid or expired token");
    }
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, include: { role: true } });
    if (!user || !user.isActive) throw unauthorized("Account disabled or not found");
    const role = user.role.key as RoleKey;
    req.user = { id: user.id, email: user.email, role, permissions: ROLE_PERMISSIONS[role] ?? [], name: `${user.firstName} ${user.lastName}` };
    next();
  } catch (e) {
    next(e);
  }
}

/** Server-side permission check. Passes if user holds ANY of the listed permissions. */
export const requirePermission = (...perms: PermissionKey[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!perms.some((p) => req.user!.permissions.includes(p))) return next(forbidden());
  next();
};

export const can = (user: AuthUser | undefined, perm: PermissionKey) => !!user?.permissions.includes(perm);

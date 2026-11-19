import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, passwordSchema } from "@cd/shared";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { authenticate, signAccessToken } from "../middleware/auth.js";
import { audit, hashToken, randomToken, sendEmail } from "../services/core.js";
import { badRequest, ok, parse, unauthorized, wrap } from "../utils/http.js";

export const authRouter = Router();
const REFRESH_COOKIE = "cd_refresh";
const REFRESH_DAYS = 14;
const tooMany = { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } };
// Credential endpoints: only FAILED attempts count toward the limit (brute-force protection without locking out real use).
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === "test" ? 1000 : 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: tooMany });
// Session refresh happens on every admin page load, so it gets a much higher ceiling.
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === "test" ? 10000 : 300, standardHeaders: true, legacyHeaders: false, message: tooMany });
// Reset/forgot-password trigger emails and are always "successful", so count every request.
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === "test" ? 1000 : 10, standardHeaders: true, legacyHeaders: false, message: tooMany });

const cookieOpts = { httpOnly: true, sameSite: "strict" as const, secure: env.COOKIE_SECURE, path: "/api/auth", maxAge: REFRESH_DAYS * 864e5 };

async function issueSession(userId: string, userAgent: string | undefined, res: import("express").Response) {
  const token = randomToken();
  await prisma.refreshSession.create({ data: { userId, tokenHash: hashToken(token), userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) } });
  res.cookie(REFRESH_COOKIE, token, cookieOpts);
  return signAccessToken(userId);
}

const publicUser = (u: { id: string; email: string; firstName: string; lastName: string; role: { key: string; name: string } }) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role.key, roleName: u.role.name });

authRouter.post("/login", limiter, wrap(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
  // constant-ish work even if user is missing, to limit user enumeration
  const valid = await bcrypt.compare(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !user.isActive || !valid) throw unauthorized("Invalid email or password");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken = await issueSession(user.id, req.headers["user-agent"], res);
  await audit({ ...req, user: { id: user.id } } as never, "login", "User", user.id);
  ok(res, { accessToken, user: publicUser(user) });
}));

authRouter.post("/refresh", refreshLimiter, wrap(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized("No session");
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { role: true } } } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    throw unauthorized("Session expired");
  }
  // rotate
  await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const accessToken = await issueSession(session.userId, req.headers["user-agent"], res);
  ok(res, { accessToken, user: publicUser(session.user) });
}));

authRouter.post("/logout", wrap(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await prisma.refreshSession.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  ok(res, { loggedOut: true });
}));

authRouter.get("/me", authenticate, wrap(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { role: true } });
  ok(res, { ...publicUser(u), permissions: req.user!.permissions });
}));

authRouter.post("/forgot-password", emailLimiter, wrap(async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const token = randomToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    const link = `${env.CLIENT_URL}/admin/reset-password?token=${token}`;
    await sendEmail(user.email, "Reset your password", `<p>Use this link within 1 hour to reset your password:</p><p><a href="${link}">${link}</a></p>`);
  }
  // identical response whether or not the account exists
  ok(res, { message: "If that account exists, a reset link has been sent." });
}));

authRouter.post("/reset-password", emailLimiter, wrap(async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw badRequest("Reset link is invalid or has expired");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.refreshSession.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  ok(res, { message: "Password updated. Please sign in." });
}));

authRouter.post("/change-password", authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: passwordSchema }), req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest("Current password is incorrect");
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await audit(req, "change-password", "User", u.id);
  ok(res, { message: "Password changed" });
}));

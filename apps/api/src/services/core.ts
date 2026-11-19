import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Request } from "express";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from "cloudinary";
import { env, uploadsDir } from "../config/env.js";
import { prisma } from "../db.js";

// ───── Audit log ─────
export async function audit(req: Request | undefined, action: string, entity: string, entityId?: string | null, metadata?: object) {
  try {
    await prisma.auditLog.create({ data: { userId: req?.user?.id ?? null, action, entity, entityId: entityId ?? null, metadata: metadata as object | undefined, ip: req?.ip } });
  } catch (e) {
    console.error("audit failed", e);
  }
}

// ───── Notifications (in-app, broadcast to users holding a role) ─────
export async function notifyStaff(title: string, body?: string, link?: string) {
  const users = await prisma.user.findMany({ where: { isActive: true, role: { key: { in: ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER"] } } }, select: { id: true } });
  if (!users.length) return;
  await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) });
}

// ───── Tokens ─────
export const randomToken = () => crypto.randomBytes(32).toString("hex");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

// ───── Email ─────
const transport = env.SMTP_HOST ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined }) : null;
export async function sendEmail(to: string, subject: string, html: string) {
  if (!transport) {
    console.log(`[email:not-configured] to=${to} subject="${subject}"\n${html.replace(/<[^>]+>/g, " ").slice(0, 400)}`);
    return { delivered: false };
  }
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html });
  return { delivered: true };
}

// ───── Image storage: Cloudinary when configured, local disk otherwise ─────
const cloudinaryOn = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
if (cloudinaryOn) cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

export const ALLOWED_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Verify the real file signature, not just the client-declared MIME type. */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export async function storeImage(buf: Buffer, folder = "dealership") {
  const mime = sniffImage(buf);
  if (!mime) throw new Error("Unsupported or corrupt image (JPEG, PNG or WebP only)");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image too large");
  if (cloudinaryOn) {
    const r = await new Promise<{ secure_url: string; public_id: string; width: number; height: number }>((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder, resource_type: "image" }, (err, res) => (err || !res ? reject(err) : resolve(res as never))).end(buf);
    });
    return { url: r.secure_url, publicId: r.public_id, mimeType: mime, width: r.width, height: r.height };
  }
  const filename = `${crypto.randomUUID()}.${ALLOWED_IMAGE_TYPES[mime]}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, filename), buf);
  return { url: `/uploads/${filename}`, publicId: filename, mimeType: mime, width: null as number | null, height: null as number | null };
}

export async function deleteImage(publicId?: string | null) {
  if (!publicId) return;
  try {
    if (cloudinaryOn) await cloudinary.uploader.destroy(publicId);
    else if (!publicId.includes("/") && !publicId.includes("\\")) await fs.unlink(path.join(uploadsDir, publicId));
  } catch {
    /* already gone */
  }
}

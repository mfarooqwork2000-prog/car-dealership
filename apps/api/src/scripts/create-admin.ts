/**
 * Secure Super Admin setup. Usage:
 *   npm run admin:create
 * Prompts for credentials (password input is not echoed and never stored in the repo).
 * Non-interactive (CI): ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME env vars.
 */
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { passwordSchema } from "@cd/shared";
import { prisma } from "../db.js";

function ask(q: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
  });
}

const email = (process.env.ADMIN_EMAIL || (await ask("Email: "))).toLowerCase();
const firstName = process.env.ADMIN_FIRST_NAME || (await ask("First name: "));
const lastName = process.env.ADMIN_LAST_NAME || (await ask("Last name: "));
const password = process.env.ADMIN_PASSWORD || (await ask("Password (min 10 chars, upper+lower+number): ", true));

const check = passwordSchema.safeParse(password);
if (!check.success) { console.error("Weak password:", check.error.issues.map((i) => i.message).join("; ")); process.exit(1); }
if (!/^\S+@\S+\.\S+$/.test(email) || !firstName || !lastName) { console.error("Invalid email or name"); process.exit(1); }

const role = await prisma.role.findUnique({ where: { key: "SUPER_ADMIN" } });
if (!role) { console.error("Roles not found. Run `npm run db:seed` first."); process.exit(1); }
const user = await prisma.user.upsert({ where: { email }, update: { passwordHash: await bcrypt.hash(password, 12), roleId: role.id, isActive: true }, create: { email, firstName, lastName, roleId: role.id, passwordHash: await bcrypt.hash(password, 12) } });
console.log(`Super Admin ready: ${user.email}`);
await prisma.$disconnect();

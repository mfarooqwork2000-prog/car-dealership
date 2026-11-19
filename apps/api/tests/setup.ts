// Runs before any app module is imported: point Prisma at the TEST database.
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required to run API tests");
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL (tests wipe data)");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";

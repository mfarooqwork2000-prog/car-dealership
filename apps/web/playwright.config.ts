import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
dotenv.config({ path: path.join(root, ".env") });
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL is required for e2e (the e2e suite resets this database)");

const API_PORT = 4100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      // API against the TEST database (never the dev database)
      command: "npx tsx apps/api/src/server.ts",
      cwd: root,
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env as Record<string, string>, PORT: String(API_PORT), DATABASE_URL: testDb, CLIENT_URL: `http://localhost:${WEB_PORT}`, NODE_ENV: "development" },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: import.meta.dirname,
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env as Record<string, string>, API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});

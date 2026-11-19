/// <reference types="vitest" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: Object.fromEntries(["/api", "/uploads", "/sitemap.xml", "/robots.txt"].map((p) => [p, process.env.API_URL ?? "http://localhost:4000"])),
  },
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], css: false, exclude: ["e2e/**", "node_modules/**"] },
});

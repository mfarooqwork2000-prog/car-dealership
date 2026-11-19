// Vercel serverless entry: wraps the Express app (same code as apps/api/src/server.ts).
import { createApp } from "../apps/api/src/app.js";

export default createApp();

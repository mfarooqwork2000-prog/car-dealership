import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, uploadsDir } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { adminRouter } from "./modules/admin.js";
import { authRouter } from "./modules/auth.js";
import { cmsRouter } from "./modules/cms.js";
import { adminCustomers, adminLeads, publicLeads } from "./modules/leads.js";
import { publicRouter, seoRouter } from "./modules/public.js";
import { adminVehicles, publicVehicles } from "./modules/vehicles.js";
import { openApiDoc } from "./docs.js";
import swaggerUi from "swagger-ui-express";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CLIENT_URL.split(","), credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  // Auth uses a bearer access token (not a cookie) + a SameSite=Strict refresh cookie scoped to /api/auth,
  // so cross-site requests cannot ride on ambient credentials (CSRF-safe by construction).
  app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: env.NODE_ENV === "test" ? 100000 : 300, standardHeaders: true, legacyHeaders: false }));

  app.use("/uploads", express.static(uploadsDir, { maxAge: "7d", setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") }));
  app.get("/api/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDoc));

  app.use("/api/auth", authRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/public/vehicles", publicVehicles);
  app.use("/api/public/leads", publicLeads);
  app.use("/api/admin/vehicles", adminVehicles);
  app.use("/api/admin/leads", adminLeads);
  app.use("/api/admin/customers", adminCustomers);
  app.use("/api/admin/cms", cmsRouter);
  app.use("/api/admin", adminRouter);
  app.use(seoRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

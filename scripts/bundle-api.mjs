// Bundles the Express app into a single ESM file for the Vercel serverless function.
import { build } from "esbuild";
await build({
  entryPoints: ["apps/api/src/vercel-entry.ts"],
  outfile: "api/index.mjs",
  bundle: true, platform: "node", format: "esm", target: "node22",
  external: ["@prisma/client", ".prisma/client", "bcrypt"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url); import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  logLevel: "info",
});

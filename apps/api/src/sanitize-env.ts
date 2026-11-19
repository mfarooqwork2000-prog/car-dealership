// Hosting dashboards/CLIs sometimes store values with a BOM or trailing whitespace; normalise before config is parsed.
for (const [k, v] of Object.entries(process.env)) {
  if (typeof v === "string") {
    const clean = v.replace(/^\uFEFF/, "").trim();
    if (clean !== v) process.env[k] = clean;
  }
}
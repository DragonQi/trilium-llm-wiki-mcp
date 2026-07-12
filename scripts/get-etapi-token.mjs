#!/usr/bin/env node
// Dev convenience: logs into the local Trilium via TRILIUM_PASSWORD and prints
// an ETAPI authToken. Usage: node scripts/get-etapi-token.mjs [--write]
// --write updates/creates TRILIUM_TOKEN=... in .env.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const url = process.env.TRILIUM_URL ?? "http://localhost:8080";
const password = process.env.TRILIUM_PASSWORD;
const tokenName = process.env.TRILIUM_TOKEN_NAME ?? "trilium-mcp-dev";
if (!password) {
  console.error("Set TRILIUM_PASSWORD in .env first (after initializing Trilium).");
  process.exit(1);
}

const res = await fetch(`${url}/etapi/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password, tokenName }),
});
if (!res.ok) {
  console.error(`Login failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { authToken } = await res.json();
console.log(authToken);

if (process.argv.includes("--write")) {
  const envPath = ".env";
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^TRILIUM_TOKEN=/m.test(body)) {
    body = body.replace(/^TRILIUM_TOKEN=.*/m, `TRILIUM_TOKEN=${authToken}`);
  } else {
    body += `\nTRILIUM_TOKEN=${authToken}\n`;
  }
  writeFileSync(envPath, body);
  console.error("Wrote TRILIUM_TOKEN to .env");
}

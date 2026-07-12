import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { integrationEnabled } from "../helpers/integration.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bin = resolve(root, "dist", "cli", "index.js");

// The hooks fire `trilium-wiki <cmd>` as a subprocess. We can't drive a real
// Claude Code session from a test, but we CAN spawn the actual bin the hook
// invokes and assert it returns the expected content + exit 0 against the live
// Trilium. Requires `npm run build` (dist/cli/index.js) to have run.
const ready = integrationEnabled() && existsSync(bin);
const describeHooks = ready ? describe : describe.skip;

describeHooks("trilium-wiki hooks (E2E bin spawn)", () => {
  it("SessionStart hook: `trilium-wiki brief` returns the wiki brief", () => {
    const out = execFileSync(process.execPath, [bin, "brief"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      timeout: 30000,
    });
    expect(out).toContain("LLM Wiki brief");
    expect(out).toContain("weak-confidence pages:");
  });

  it("Stop hook: `trilium-wiki checkpoint` writes a session marker (exit 0)", () => {
    // execFileSync throws on non-zero exit, so reaching the assertion means exit 0.
    const out = execFileSync(process.execPath, [bin, "checkpoint"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      timeout: 30000,
    });
    expect(out).toContain("Checkpoint written");
  });

  it("`trilium-wiki doctor` reports OK for Trilium and Vault", () => {
    const out = execFileSync(process.execPath, [bin, "doctor"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      timeout: 30000,
    });
    expect(out).toContain("[OK] Trilium");
    expect(out).toContain("[OK] Vault");
  });
});

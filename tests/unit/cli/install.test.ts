/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdInstall } from "../../../src/cli/install.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tw-install-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("cmdInstall", () => {
  it("creates settings.json with SessionStart/Stop hooks when absent", async () => {
    const r = await cmdInstall({ claudeDir: dir });
    expect(r.ok).toBe(true);
    const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("trilium-wiki brief");
    expect(settings.hooks.Stop[0].hooks[0].command).toContain("trilium-wiki checkpoint");
  });

  it("merges non-destructively and is idempotent", async () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        hooks: { SessionStart: [{ matcher: "boom", hooks: [{ type: "command", command: "keep-me" }] }] },
      }),
    );
    await cmdInstall({ claudeDir: dir });
    await cmdInstall({ claudeDir: dir }); // idempotent

    const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    // pre-existing hook preserved
    expect(settings.hooks.SessionStart.find((h: any) => h.matcher === "boom").hooks[0].command).toBe(
      "keep-me",
    );
    // our bucket exists and is not duplicated
    const ours = settings.hooks.SessionStart.filter((h: any) => (h.matcher ?? "") === "");
    expect(ours).toHaveLength(1);
    expect(ours[0].hooks).toHaveLength(1);
  });

  it("dry-run does not write", async () => {
    const r = await cmdInstall({ claudeDir: dir, dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("dry-run");
    expect(() => readFileSync(join(dir, "settings.json"), "utf8")).toThrow();
  });
});

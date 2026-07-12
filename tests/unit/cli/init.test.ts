/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/cli/vault.js", () => ({ seedVault: vi.fn() }));

import { cmdInit } from "../../../src/cli/init.js";
import { seedVault } from "../../../src/cli/vault.js";

beforeEach(() => vi.mocked(seedVault).mockReset());

describe("cmdInit", () => {
  it("reports created notes on a fresh seed", async () => {
    vi.mocked(seedVault).mockResolvedValue({
      rootId: "root1",
      created: [{ title: "LLM Wiki" }, { title: "Concepts" }],
      skipped: [],
    });
    const r = await cmdInit({} as any);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("root1");
    expect(r.stdout).toContain("LLM Wiki");
  });

  it("reports 'already seeded' when nothing was created", async () => {
    vi.mocked(seedVault).mockResolvedValue({
      rootId: "root1",
      created: [],
      skipped: [{ title: "LLM Wiki" }],
    });
    const r = await cmdInit({} as any);
    expect(r.stdout).toContain("none — already seeded");
  });
});

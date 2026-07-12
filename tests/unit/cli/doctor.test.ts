/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/cli/vault.js", () => ({ findVaultRoot: vi.fn() }));

import { cmdDoctor } from "../../../src/cli/doctor.js";
import { findVaultRoot } from "../../../src/cli/vault.js";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";

beforeEach(() => {
  resetMockStore();
  vi.mocked(findVaultRoot).mockReset();
});

describe("cmdDoctor", () => {
  it("fails when Trilium is unreachable", async () => {
    const client = mockClient();
    client.getAppInfo.mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.mocked(findVaultRoot).mockResolvedValue({ noteId: "root" } as any);
    const r = await cmdDoctor(client);
    expect(r.ok).toBe(false);
    expect(r.stdout).toContain("[FAIL] Trilium");
  });

  it("fails and suggests init when the vault is missing", async () => {
    const client = mockClient();
    client.getAppInfo.mockResolvedValue({ appVersion: "0.95.0" });
    vi.mocked(findVaultRoot).mockResolvedValue(null);
    const r = await cmdDoctor(client);
    expect(r.ok).toBe(false);
    expect(r.stdout).toContain("[FAIL] Vault");
    expect(r.stdout).toContain("trilium-wiki init");
  });

  it("passes when Trilium reachable and vault present", async () => {
    const client = mockClient();
    client.getAppInfo.mockResolvedValue({ appVersion: "0.95.0" });
    vi.mocked(findVaultRoot).mockResolvedValue({ noteId: "root" } as any);
    const r = await cmdDoctor(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("[OK] Trilium");
    expect(r.stdout).toContain("[OK] Vault");
  });
});

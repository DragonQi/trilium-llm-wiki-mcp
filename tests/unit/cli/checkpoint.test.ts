/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/cli/vault.js", () => ({
  findVaultRoot: vi.fn(),
  appendLogEntry: vi.fn(),
}));

import { cmdCheckpoint } from "../../../src/cli/checkpoint.js";
import { findVaultRoot, appendLogEntry } from "../../../src/cli/vault.js";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";

beforeEach(() => {
  resetMockStore();
  vi.mocked(findVaultRoot).mockReset();
  vi.mocked(appendLogEntry).mockReset();
});

describe("cmdCheckpoint", () => {
  it("returns ok:false when vault missing", async () => {
    vi.mocked(findVaultRoot).mockResolvedValue(null);
    const r = await cmdCheckpoint(mockClient());
    expect(r.ok).toBe(false);
  });

  it("appends a session log entry and reports counts", async () => {
    vi.mocked(findVaultRoot).mockResolvedValue({ noteId: "root" } as any);
    const client = mockClient();
    client.searchNotes.mockResolvedValue([]);
    const r = await cmdCheckpoint(client);
    expect(r.ok).toBe(true);
    expect(appendLogEntry).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(appendLogEntry).mock.calls[0]![1];
    expect(entry.op).toBe("session");
    expect(r.stdout).toContain("weak=0");
  });

  it("warns when weak/orphan > 0", async () => {
    vi.mocked(findVaultRoot).mockResolvedValue({ noteId: "root" } as any);
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "w1" }]);
    const r = await cmdCheckpoint(client);
    expect(r.stderr).toContain("review");
  });
});

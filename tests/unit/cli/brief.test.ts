/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/cli/vault.js", () => ({
  findVaultRoot: vi.fn(),
  getIndexNote: vi.fn(),
  getLogNote: vi.fn(),
}));

import { cmdBrief } from "../../../src/cli/brief.js";
import { findVaultRoot, getIndexNote, getLogNote } from "../../../src/cli/vault.js";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";

beforeEach(() => {
  resetMockStore();
  vi.mocked(findVaultRoot).mockReset();
  vi.mocked(getIndexNote).mockReset();
  vi.mocked(getLogNote).mockReset();
});

describe("cmdBrief", () => {
  it("returns ok:false when the vault is missing", async () => {
    vi.mocked(findVaultRoot).mockResolvedValue(null);
    const r = await cmdBrief(mockClient());
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain("init");
  });

  it("assembles a brief with index excerpt, recent activity, and flags", async () => {
    vi.mocked(findVaultRoot).mockResolvedValue({ noteId: "root" } as any);
    vi.mocked(getIndexNote).mockResolvedValue({ noteId: "idx" } as any);
    vi.mocked(getLogNote).mockResolvedValue({ noteId: "log" } as any);
    const client = mockClient();
    client.getNoteContent.mockImplementation(async (id: string) =>
      id === "idx"
        ? "<h1>Index</h1><p>important stuff</p>"
        : "<h1>Log</h1>\n## [2026-07-12] ingest | demo",
    );
    client.searchNotes.mockResolvedValue([]);

    const r = await cmdBrief(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("LLM Wiki brief");
    expect(r.stdout).toContain("important stuff");
    expect(r.stdout).toContain("[2026-07-12] ingest — demo");
    expect(r.stdout).toContain("weak-confidence pages: 0");
  });
});

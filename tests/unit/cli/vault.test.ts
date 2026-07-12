/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { seedVault, findVaultRoot, findChildByTitle } from "../../../src/cli/vault.js";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";

beforeEach(resetMockStore);

describe("seedVault", () => {
  it("creates the full structure when the vault is empty", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([]); // nothing exists
    client.createNote.mockImplementation(async (input: any) => ({
      note: { noteId: `n-${input.title}`, title: input.title, parentNoteIds: [input.parentNoteId], childNoteIds: [], attributes: [] },
      branch: { branchId: `b-${input.title}` },
    }));
    client.getNoteAttributes.mockResolvedValue([]);
    client.createAttribute.mockResolvedValue({ attributeId: "a1" });

    const { rootId, created, skipped } = await seedVault(client);
    expect(rootId).toBeTruthy();
    expect(created.length).toBeGreaterThan(10); // root + Purpose + Raw + Wiki + 7 layers + Review + Index + Log
    expect(skipped.length).toBe(0);
  });

  it("is idempotent — skips everything when the structure already exists", async () => {
    const client = mockClient();
    // findChildByTitle filters by exact title; return a matching note for any search.
    client.searchNotes.mockImplementation(async (params: any) => [
      { noteId: `existing-${params.search}`, title: params.search, parentNoteIds: [], childNoteIds: [], attributes: [] },
    ]);
    const { created, skipped } = await seedVault(client);
    expect(created.length).toBe(0);
    expect(skipped.length).toBeGreaterThan(10);
    expect(client.createNote).not.toHaveBeenCalled();
  });
});

describe("findVaultRoot / findChildByTitle", () => {
  it("returns null when no exact-title match", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "other", title: "Not It" }]);
    expect(await findChildByTitle(client, "root", "LLM Wiki")).toBeNull();
    expect(await findVaultRoot(client)).toBeNull();
  });
});

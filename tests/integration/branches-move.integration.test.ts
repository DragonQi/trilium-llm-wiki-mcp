import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import {
  integrationEnabled,
  liveClient,
  ensureTestRoot,
  cleanupTestRoot,
} from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("branches & move (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("clones a note via createBranch, then moves it", async () => {
    const folderA = (
      await client.createNote({ parentNoteId: rootId, title: "A", type: "book", content: "" })
    ).note.noteId;
    const folderB = (
      await client.createNote({ parentNoteId: rootId, title: "B", type: "book", content: "" })
    ).note.noteId;
    const leaf = (
      await client.createNote({ parentNoteId: folderA, title: "leaf", type: "text", content: "" })
    ).note.noteId;

    // clone leaf under B
    const cloneBranch = await client.createBranch({ noteId: leaf, parentNoteId: folderB });
    const afterClone = await client.getNote(leaf);
    expect(afterClone.parentNoteIds.slice().sort()).toEqual([folderA, folderB].sort());

    // move leaf to B only
    await client.moveNote(leaf, folderB);
    const afterMove = await client.getNote(leaf);
    expect(afterMove.parentNoteIds).toEqual([folderB]);
    expect(cloneBranch.branchId).toBeTruthy();
  });
});

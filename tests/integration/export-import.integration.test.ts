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

describeIntegration("export/import (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("exports a subtree as a ZIP (starts with PK magic)", async () => {
    const note = await client.createNote({
      parentNoteId: rootId,
      title: "exportable",
      type: "text",
      content: "<p>export me</p>",
    });
    const buf = await client.exportNoteSubtree(note.note.noteId, "html");
    expect(Buffer.isBuffer(buf)).toBe(true);
    // ZIP local file header magic: 0x50 0x4B ("PK")
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    await client.deleteNote(note.note.noteId);
  });

  it("export of 'root' returns a non-empty ZIP", async () => {
    const buf = await client.exportNoteSubtree("root", "html");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
  });
});

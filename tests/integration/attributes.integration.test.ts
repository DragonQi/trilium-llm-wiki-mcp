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

describeIntegration("attributes (integration)", () => {
  let client: EtapiClient;
  let rootId: string;
  let noteId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
    const r = await client.createNote({
      parentNoteId: rootId,
      title: "attr-note",
      type: "text",
      content: "",
    });
    noteId = r.note.noteId;
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("upsert (create then update) and read attributes", async () => {
    const created = await client.upsertAttribute({
      noteId,
      type: "label",
      name: "status",
      value: "weak",
    });
    expect(created.value).toBe("weak");

    const updated = await client.upsertAttribute({
      noteId,
      type: "label",
      name: "status",
      value: "strong",
    });
    expect(updated.value).toBe("strong");

    const attrs = await client.getNoteAttributes(noteId);
    const status = attrs.find((a) => a.name === "status");
    expect(status?.value).toBe("strong");
    expect(attrs.filter((a) => a.name === "status")).toHaveLength(1); // upsert did not duplicate

    await client.deleteAttribute(updated.attributeId);
    const after = await client.getNoteAttributes(noteId);
    expect(after.some((a) => a.name === "status")).toBe(false);
  });

  it("createAttribute preserves existing same-name relations (multi-valued, NOT upsert)", async () => {
    const targetA = (await client.createNote({ parentNoteId: rootId, title: "mv-a", type: "text", content: "" })).note.noteId;
    const targetB = (await client.createNote({ parentNoteId: rootId, title: "mv-b", type: "text", content: "" })).note.noteId;
    const mvNote = (await client.createNote({ parentNoteId: rootId, title: "mv-note", type: "text", content: "" })).note.noteId;
    try {
      await client.createAttribute({ noteId: mvNote, type: "relation", name: "relatesTo", value: targetA });
      await client.createAttribute({ noteId: mvNote, type: "relation", name: "relatesTo", value: targetB });
      const attrs = await client.getNoteAttributes(mvNote);
      const rels = attrs.filter((a) => a.type === "relation" && a.name === "relatesTo").map((a) => a.value).sort();
      expect(rels).toEqual([targetA, targetB].sort()); // both preserved — add_attribute is multi-valued-safe
    } finally {
      await client.deleteNote(mvNote);
      await client.deleteNote(targetA);
      await client.deleteNote(targetB);
    }
  });
});

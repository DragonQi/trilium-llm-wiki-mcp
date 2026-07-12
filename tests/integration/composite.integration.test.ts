import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import {
  integrationEnabled,
  liveClient,
  ensureTestRoot,
  cleanupTestRoot,
  waitForSearch,
} from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("composite tools (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("upsertNote creates then updates on repeated same title", async () => {
    const title = `upsert-target-${Math.random().toString(36).slice(2, 8)}`;
    const r1 = await client.upsertNote({
      parentNoteId: rootId,
      title,
      type: "text",
      content: "<p>v1</p>",
    });
    expect(r1.created).toBe(true);
    const r2 = await client.upsertNote({
      parentNoteId: rootId,
      title,
      type: "text",
      content: "<p>v2</p>",
    });
    expect(r2.created).toBe(false);
    expect(r2.note.noteId).toBe(r1.note.noteId);
    expect(await client.getNoteContent(r1.note.noteId)).toContain("v2");
    await client.deleteNote(r1.note.noteId);
  });

  it("getBacklinks finds notes pointing via a relation", async () => {
    const target = (
      await client.createNote({ parentNoteId: rootId, title: "cb-target", type: "text", content: "" })
    ).note.noteId;
    const source = await client.createNote({
      parentNoteId: rootId,
      title: "cb-source",
      type: "text",
      content: "",
    });
    await client.upsertAttribute({
      noteId: source.note.noteId,
      type: "relation",
      name: "relatesTo",
      value: target,
    });
    const backlinks = await client.getBacklinks(target);
    expect(backlinks.some((n) => n.noteId === source.note.noteId)).toBe(true);
    await client.deleteNote(source.note.noteId);
    await client.deleteNote(target);
  });

  it("searchByAttribute finds a labeled note", async () => {
    const labelVal = `sb${Math.random().toString(36).slice(2, 8)}`;
    const note = await client.createNote({
      parentNoteId: rootId,
      title: "sb-note",
      type: "text",
      content: "",
    });
    await client.upsertAttribute({
      noteId: note.note.noteId,
      type: "label",
      name: "wftest",
      value: labelVal,
    });
    await waitForSearch(
      client,
      `#wftest=${labelVal}`,
      (notes) => notes.some((n) => n.noteId === note.note.noteId),
    );
    const hits = await client.searchNotes({ search: `#wftest=${labelVal}` });
    expect(hits.some((n) => n.noteId === note.note.noteId)).toBe(true);
    await client.deleteNote(note.note.noteId);
  });

  it("replaceNoteSection inserts a section then updates it", async () => {
    const note = await client.createNote({
      parentNoteId: rootId,
      title: "sec-note",
      type: "text",
      content: "<p>intro</p>",
    });
    const id = note.note.noteId;
    await client.replaceNoteSection(id, "Findings", "<p>first finding</p>");
    let body = await client.getNoteContent(id);
    expect(body).toContain("first finding");

    await client.replaceNoteSection(id, "Findings", "<p>updated finding</p>");
    body = await client.getNoteContent(id);
    expect(body).toContain("updated finding");
    await client.deleteNote(id);
  });

  it("bulkSetAttributes updates a set of matched notes", async () => {
    const tag = `bk${Math.random().toString(36).slice(2, 8)}`;
    const n1 = (
      await client.createNote({ parentNoteId: rootId, title: `${tag}-1`, type: "text", content: "" })
    ).note.noteId;
    const n2 = (
      await client.createNote({ parentNoteId: rootId, title: `${tag}-2`, type: "text", content: "" })
    ).note.noteId;
    // Give both notes a matching label so the bulk search finds them.
    await client.upsertAttribute({ noteId: n1, type: "label", name: "wftag", value: tag });
    await client.upsertAttribute({ noteId: n2, type: "label", name: "wftag", value: tag });
    await waitForSearch(client, `#wftag=${tag}`, (notes) => notes.length >= 2);
    const r = await client.bulkSetAttributes(`#wftag=${tag}`, {
      type: "label",
      name: "processed",
      value: "yes",
    });
    expect(r.updated.slice().sort()).toEqual([n1, n2].sort());
    const attrs = await client.getNoteAttributes(n1);
    expect(attrs.some((a) => a.name === "processed" && a.value === "yes")).toBe(true);
    await client.deleteNote(n1);
    await client.deleteNote(n2);
  });
});

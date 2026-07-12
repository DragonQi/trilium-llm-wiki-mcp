import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import {
  integrationEnabled,
  liveClient,
  ensureTestRoot,
  cleanupTestRoot,
  TEST_ROOT_TITLE,
} from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("notes (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("creates, reads, updates, appends, deletes a note", async () => {
    const created = await client.createNote({
      parentNoteId: rootId,
      title: "it-note",
      type: "text",
      content: "<p>hello</p>",
    });
    const id = created.note.noteId;

    const note = await client.getNote(id);
    expect(note.title).toBe("it-note");

    await client.updateNote(id, { title: "it-note-renamed" });
    expect((await client.getNote(id)).title).toBe("it-note-renamed");

    expect(await client.getNoteContent(id)).toContain("hello");

    await client.appendToNote(id, "<p>world</p>");
    expect(await client.getNoteContent(id)).toContain("world");

    const tree = await client.getNoteTree(rootId);
    expect(tree.some((n) => n.noteId === id)).toBe(true);

    const subtree = await client.getNoteSubtree(rootId, { maxNodes: 50 });
    const flat = JSON.stringify(subtree);
    expect(flat).toContain(id);

    const path = await client.getNotePath(id);
    expect(path.some((n) => n.noteId === rootId)).toBe(true);

    await client.deleteNote(id);
    await expect(client.getNote(id)).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
  });

  it("get_app_info returns version", async () => {
    const info = await client.getAppInfo();
    expect(typeof info.appVersion).toBe("string");
    expect(info.appVersion.length).toBeGreaterThan(0);
  });

  it("search_notes finds the test root", async () => {
    const results = await client.searchNotes({ search: TEST_ROOT_TITLE });
    expect(results.some((n) => n.title === TEST_ROOT_TITLE)).toBe(true);
  });
});

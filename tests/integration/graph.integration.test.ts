import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import {
  integrationEnabled,
  liveClient,
  ensureTestRoot,
  cleanupTestRoot,
  waitForSearch,
} from "../helpers/integration.js";
import { findRelated } from "../../src/graph/relevance.js";
import { queryWiki } from "../../src/graph/query.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

describeIntegration("graph core (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("find_related ranks a neighbor above an isolated note", async () => {
    const a = (
      await client.createNote({ parentNoteId: rootId, title: "gr-a", type: "text", content: "" })
    ).note.noteId;
    const b = (
      await client.createNote({ parentNoteId: rootId, title: "gr-b", type: "text", content: "" })
    ).note.noteId;
    const iso = (
      await client.createNote({ parentNoteId: rootId, title: "gr-iso", type: "text", content: "" })
    ).note.noteId;
    // a -> b relation; iso has no relations and is not a relation target.
    await client.upsertAttribute({ noteId: a, type: "relation", name: "relatesTo", value: b });
    await waitForSearch(client, "~relatesTo.noteId", (n) => n.some((x) => x.noteId === a));
    const { scores } = await findRelated(client, a, { maxNodes: 50 });
    const ids = scores.map((s) => s.noteId);
    expect(ids).toContain(b);
    expect(ids).not.toContain(iso); // not in the relation graph around a
    const bScore = scores.find((s) => s.noteId === b)!.compositeScore;
    expect(bScore).toBeGreaterThan(0);
    await client.deleteNote(a);
    await client.deleteNote(b);
    await client.deleteNote(iso);
  });

  it("query_wiki returns numbered pages with a citation hint", async () => {
    const note = await client.createNote({
      parentNoteId: rootId,
      title: "qw-target",
      type: "text",
      content: "<p>graph retrieval works</p>",
    });
    await waitForSearch(client, "qw-target", (n) => n.some((x) => x.noteId === note.note.noteId));
    const r = await queryWiki(client, "qw-target", { maxPages: 5 });
    expect(r.pages.length).toBeGreaterThan(0);
    expect(r.pages[0]!.n).toBe(1);
    expect(r.hint).toContain("[1]");
    await client.deleteNote(note.note.noteId);
  });
});

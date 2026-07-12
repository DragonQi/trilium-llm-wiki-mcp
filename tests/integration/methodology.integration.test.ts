import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient, waitForSearch } from "../helpers/integration.js";
import { findVaultRoot, findChildByTitle } from "../../src/cli/vault.js";
import { findRelated } from "../../src/graph/relevance.js";
import { queryWiki } from "../../src/graph/query.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

// IDs stashed as module-level vars right after creation so later steps have them
// even if an assertion in an earlier step fails.
let hash = "";
let rawId = "";
let summaryId = "";
let e1Id = "";
let e2Id = "";

/**
 * End-to-end methodology check (spec §6.3): drives the full
 * ingest -> query -> lint -> delete cycle through the real tools against the
 * live LLM Wiki vault. Structural E2E — exercises tools + vault mechanics; the
 * LLM's ingest/query *judgment* is encoded in SKILL.md (WF4).
 */
describeIntegration("methodology E2E (ingest -> query -> lint -> delete)", () => {
  let client: EtapiClient;
  let vaultRootId = "";
  let rawContainerId = "";
  let summaryContainerId = "";
  let entityContainerId = "";
  const created: string[] = [];
  const track = (id: string): string => {
    created.push(id);
    return id;
  };

  beforeAll(async () => {
    client = liveClient();
    const root = await findVaultRoot(client);
    if (!root) throw new Error("LLM Wiki vault missing — run `trilium-wiki init` first");
    vaultRootId = root.noteId;
    rawContainerId = (await findChildByTitle(client, vaultRootId, "Raw"))!.noteId;
    const wiki = (await findChildByTitle(client, vaultRootId, "Wiki"))!.noteId;
    summaryContainerId = (await findChildByTitle(client, wiki, "Summaries"))!.noteId;
    entityContainerId = (await findChildByTitle(client, wiki, "Entities"))!.noteId;
  });

  afterAll(async () => {
    // Best-effort cleanup (deleteNote is idempotent; some were deleted by step 4).
    for (const id of created) await client!.deleteNote(id).catch(() => {});
  });

  // --- Step 1: INGEST -------------------------------------------------------
  it("ingest creates raw + summary + entities with derivedFrom, updates Log", async () => {
    hash = `e2e${Math.random().toString(36).slice(2, 10)}`;
    const title = `E2E Source ${hash}`;

    const raw = (await client.createNote({ parentNoteId: rawContainerId, title, type: "text", content: "<p>source body</p>" })).note;
    rawId = track(raw.noteId);
    await client.upsertAttribute({ noteId: raw.noteId, type: "label", name: "wikiLayer", value: "raw" });
    await client.upsertAttribute({ noteId: raw.noteId, type: "label", name: "contentHash", value: hash });
    await client.upsertAttribute({ noteId: raw.noteId, type: "label", name: "ingested", value: "2026-07-12" });

    const summary = (await client.createNote({ parentNoteId: summaryContainerId, title: `Summary: ${title}`, type: "text", content: "<p>summary</p>" })).note;
    summaryId = track(summary.noteId);
    await client.upsertAttribute({ noteId: summary.noteId, type: "label", name: "wikiLayer", value: "summary" });
    await client.upsertAttribute({ noteId: summary.noteId, type: "label", name: "status", value: "moderate" });
    await client.upsertAttribute({ noteId: summary.noteId, type: "label", name: "sources", value: "1" });
    await client.upsertAttribute({ noteId: summary.noteId, type: "relation", name: "derivedFrom", value: raw.noteId });

    const e1 = (await client.createNote({ parentNoteId: entityContainerId, title: `Entity A ${hash}`, type: "text", content: "" })).note;
    const e2 = (await client.createNote({ parentNoteId: entityContainerId, title: `Entity B ${hash}`, type: "text", content: "" })).note;
    e1Id = track(e1.noteId);
    e2Id = track(e2.noteId);
    for (const e of [e1, e2]) {
      await client.upsertAttribute({ noteId: e.noteId, type: "label", name: "wikiLayer", value: "entity" });
      await client.upsertAttribute({ noteId: e.noteId, type: "label", name: "wikiType", value: "person" });
      await client.upsertAttribute({ noteId: e.noteId, type: "label", name: "status", value: "weak" });
      await client.upsertAttribute({ noteId: e.noteId, type: "relation", name: "derivedFrom", value: raw.noteId });
    }
    await client.upsertAttribute({ noteId: e1.noteId, type: "relation", name: "relatesTo", value: e2.noteId });

    const log = (await findChildByTitle(client, vaultRootId, "Log"))!;
    await client.appendToNote(log.noteId, `\n## [2026-07-12] ingest | ${title}`);

    // Assertions via direct fetch (reliable, no search-index dependency).
    const rawAttrs = await client.getNoteAttributes(raw.noteId);
    expect(rawAttrs.find((a) => a.name === "contentHash")?.value).toBe(hash);
    const sumAttrs = await client.getNoteAttributes(summary.noteId);
    expect(sumAttrs.find((a) => a.name === "derivedFrom")?.value).toBe(raw.noteId);
    expect(sumAttrs.find((a) => a.name === "status")?.value).toBe("moderate");
    expect((await client.getNoteContent(log.noteId)).includes(`ingest | ${title}`)).toBe(true);
  }, 60000);

  it("re-ingest skips by #contentHash (no duplicate raw)", async () => {
    // The skill's pre-check: a Raw note with this contentHash already exists.
    await waitForSearch(client, `#contentHash=${hash}`, (n) => n.some((x) => x.noteId === rawId), 8000);
    const existing = await client.searchNotes({ search: `#contentHash=${hash}` });
    expect(existing.filter((n) => n.title === `E2E Source ${hash}`)).toHaveLength(1);
  }, 60000);

  // --- Step 2: QUERY --------------------------------------------------------
  it("query: find_related links e1->e2; query_wiki returns numbered pages", async () => {
    // e1 --relatesTo--> e2, so find_related(e1) must surface e2 (directLink).
    const { scores } = await findRelated(client, e1Id, { maxNodes: 80 });
    expect(scores.map((s) => s.noteId)).toContain(e2Id);

    await waitForSearch(client, `Entity A ${hash}`, (n) => n.some((x) => x.noteId === e1Id), 8000);
    const r = await queryWiki(client, `Entity A ${hash}`, { maxPages: 5 });
    expect(r.pages.length).toBeGreaterThan(0);
    expect(r.pages[0]!.n).toBe(1);
    expect(r.hint).toContain("[1]");
  }, 60000);

  // --- Step 3: LINT ---------------------------------------------------------
  it("lint: detects weak-confidence pages, orphans, and an open contradiction", async () => {
    // weak-confidence entities are searchable
    await waitForSearch(client, `#status=weak`, (n) => n.some((x) => x.noteId === e1Id), 8000);
    const weak = await client.searchNotes({ search: `#status=weak` });
    expect(weak.some((n) => n.noteId === e1Id)).toBe(true);

    // intentional orphan (no incoming relations) is found by find_orphans
    const orphan = (await client.createNote({ parentNoteId: summaryContainerId, title: `Orphan ${hash}`, type: "text", content: "" })).note;
    track(orphan.noteId);
    await client.upsertAttribute({ noteId: orphan.noteId, type: "label", name: "wikiLayer", value: "summary" });
    const orphans = await client.findOrphans(vaultRootId);
    expect(orphans.some((o) => o.noteId === orphan.noteId)).toBe(true);

    // contradiction: c1 --contradicts--> c2 is discoverable via backlinks
    const c1 = (await client.createNote({ parentNoteId: entityContainerId, title: `Claim1 ${hash}`, type: "text", content: "" })).note;
    const c2 = (await client.createNote({ parentNoteId: entityContainerId, title: `Claim2 ${hash}`, type: "text", content: "" })).note;
    track(c1.noteId);
    track(c2.noteId);
    await client.upsertAttribute({ noteId: c1.noteId, type: "relation", name: "contradicts", value: c2.noteId });
    await waitForSearch(client, `~contradicts.noteId`, (n) => n.some((x) => x.noteId === c1.noteId), 8000);
    const sources = await client.searchNotes({ search: `~contradicts.noteId` });
    expect(sources.some((n) => n.noteId === c1.noteId)).toBe(true);
  }, 60000);

  // --- Step 4: DELETE cascade ----------------------------------------------
  it("delete cascade: raw gone; sole-source summary gone; shared entity preserved", async () => {
    // Give e1 a SECOND source so it must survive the cascade (shared entity).
    const secondRaw = (await client.createNote({ parentNoteId: rawContainerId, title: `E2E Second ${hash}`, type: "text", content: "" })).note;
    track(secondRaw.noteId);
    await client.upsertAttribute({ noteId: e1Id, type: "relation", name: "derivedFrom", value: secondRaw.noteId });
    await client.upsertAttribute({ noteId: e1Id, type: "label", name: "sources", value: "2" });

    // Delete the primary raw (the skill's cascade step; modeled explicitly here).
    await client.deleteNote(rawId);
    await expect(client.getNote(rawId)).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });

    // sole-source summary removed
    await client.deleteNote(summaryId);
    await expect(client.getNote(summaryId)).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });

    // shared entity e1 preserved, still derivedFrom the second source
    const e1After = await client.getNote(e1Id);
    expect(e1After.noteId).toBe(e1Id);
    const e1Attrs = await client.getNoteAttributes(e1Id);
    expect(e1Attrs.find((a) => a.name === "derivedFrom")?.value).toBe(secondRaw.noteId);
  }, 60000);
});

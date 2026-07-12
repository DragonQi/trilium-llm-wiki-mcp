import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock findRelated so query pipeline logic is tested in isolation.
vi.mock("../../../src/graph/relevance.js", () => ({
  findRelated: vi.fn(),
}));

import { queryWiki } from "../../../src/graph/query.js";
import { findRelated } from "../../../src/graph/relevance.js";
import { mockClient } from "../../helpers/mockClient.js";

beforeEach(() => {
  vi.mocked(findRelated).mockReset();
});

describe("queryWiki", () => {
  it("returns numbered pages, a citation hint, and filters excluded types", async () => {
    const client = mockClient();
    // search returns one content note + one index note (excluded)
    client.searchNotes.mockResolvedValue([
      {
        noteId: "c1",
        title: "Concept1",
        attributes: [{ type: "label", name: "wikiType", value: "concept" }],
      },
      {
        noteId: "idx",
        title: "Index",
        attributes: [{ type: "label", name: "wikiType", value: "index" }],
      },
    ]);
    // findRelated returns one related concept
    vi.mocked(findRelated).mockResolvedValue({
      scores: [{ noteId: "c2", title: "Concept2", wikiType: "concept", compositeScore: 2, signals: {
        directLink: 1, sourceOverlap: 0, adamicAdar: 0, typeAffinity: 0.6,
      } }],
      truncated: false,
    });
    client.getNote.mockImplementation(async (id: string) => ({
      noteId: id,
      title: id === "c1" ? "Concept1" : "Concept2",
      parentNoteIds: ["root"],
      attributes: [],
    }));
    client.getNoteContent.mockResolvedValue("<p>hello world</p>");

    const r = await queryWiki(client, "anything", { maxPages: 5 });
    expect(r.pages.length).toBeGreaterThan(0);
    expect(r.pages[0]!.n).toBe(1);
    expect(r.hint).toContain("[1]");
    expect(r.pages.some((p) => p.noteId === "idx")).toBe(false); // index excluded
    expect(r.pages[0]!.snippet).toContain("hello world");
  });
});

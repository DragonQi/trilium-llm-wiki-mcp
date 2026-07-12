import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  upsertNoteHandler,
  getBacklinksHandler,
  findOrphansHandler,
  searchByAttributeHandler,
  replaceNoteSectionHandler,
  bulkSetAttributesHandler,
} from "../../../src/tools/composite.js";

beforeEach(resetMockStore);

describe("upsert_note handler", () => {
  it("delegates to client.upsertNote with args", async () => {
    const client = mockClient();
    client.upsertNote.mockResolvedValue({ note: { noteId: "n1" }, created: true });
    const res = await upsertNoteHandler(
      { parentNoteId: "root", title: "T", type: "text", content: "<p>x</p>" },
      client,
    );
    expect(client.upsertNote).toHaveBeenCalledWith({
      parentNoteId: "root",
      title: "T",
      type: "text",
      content: "<p>x</p>",
    });
    const parsed = JSON.parse((res.content[0] as { text: string }).text);
    expect(parsed.created).toBe(true);
    expect(parsed.note.noteId).toBe("n1");
  });
});

describe("get_backlinks handler", () => {
  it("passes noteId and relations through", async () => {
    const client = mockClient();
    client.getBacklinks.mockResolvedValue([{ noteId: "src1" }, { noteId: "src2" }]);
    const res = await getBacklinksHandler({ noteId: "t1", relations: ["relatesTo"] }, client);
    expect(client.getBacklinks).toHaveBeenCalledWith("t1", ["relatesTo"]);
    expect(JSON.parse((res.content[0] as { text: string }).text)).toHaveLength(2);
  });
});

describe("find_orphans handler", () => {
  it("delegates to client.findOrphans", async () => {
    const client = mockClient();
    client.findOrphans.mockResolvedValue([{ noteId: "o1" }]);
    const res = await findOrphansHandler({ rootNoteId: "root" }, client);
    expect(client.findOrphans).toHaveBeenCalledWith("root");
    expect(JSON.parse((res.content[0] as { text: string }).text)[0].noteId).toBe("o1");
  });
});

describe("search_by_attribute handler", () => {
  it("passes query through with default limit 20", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "m1" }]);
    await searchByAttributeHandler({ query: "#status=weak" }, client);
    expect(client.searchNotes).toHaveBeenCalledWith({ search: "#status=weak", limit: 20 });
  });

  it("honours an explicit limit", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "m1" }]);
    const res = await searchByAttributeHandler({ query: "~author.noteId=abc", limit: 5 }, client);
    expect(client.searchNotes).toHaveBeenCalledWith({ search: "~author.noteId=abc", limit: 5 });
    expect(JSON.parse((res.content[0] as { text: string }).text)[0].noteId).toBe("m1");
  });
});

describe("replace_note_section handler", () => {
  it("delegates to client.replaceNoteSection and confirms", async () => {
    const client = mockClient();
    client.replaceNoteSection.mockResolvedValue(undefined);
    const res = await replaceNoteSectionHandler(
      { noteId: "n1", heading: "Intro", newInnerHtml: "<p>new</p>" },
      client,
    );
    expect(client.replaceNoteSection).toHaveBeenCalledWith("n1", "Intro", "<p>new</p>");
    expect((res.content[0] as { text: string }).text).toContain("Intro");
    expect((res.content[0] as { text: string }).text).toContain("n1");
  });
});

describe("bulk_set_attributes handler", () => {
  it("upserts across matched notes", async () => {
    const client = mockClient();
    client.bulkSetAttributes.mockResolvedValue({ updated: ["n1", "n2"] });
    const res = await bulkSetAttributesHandler(
      { search: "#status", type: "label", name: "status", value: "weak" },
      client,
    );
    expect(client.bulkSetAttributes).toHaveBeenCalledWith("#status", {
      type: "label",
      name: "status",
      value: "weak",
      isInheritable: undefined,
    });
    expect(JSON.parse((res.content[0] as { text: string }).text).updated).toEqual(["n1", "n2"]);
  });
});

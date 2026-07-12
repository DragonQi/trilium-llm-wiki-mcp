import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { createNoteHandler, appendToNoteHandler, moveNoteHandler } from "../../../src/tools/notes-write.js";

beforeEach(resetMockStore);

describe("create_note handler", () => {
  it("creates and returns {note,branch}", async () => {
    const client = mockClient();
    client.createNote.mockResolvedValue({ note: { noteId: "n1" }, branch: { branchId: "b1" } });
    const res = await createNoteHandler(
      { parentNoteId: "root", title: "T", type: "text", content: "<p>x</p>" },
      client,
    );
    expect(client.createNote).toHaveBeenCalledWith({
      parentNoteId: "root",
      title: "T",
      type: "text",
      content: "<p>x</p>",
    });
    expect(JSON.parse((res.content[0] as { text: string }).text).note.noteId).toBe("n1");
  });
});

describe("append_to_note handler", () => {
  it("appends and returns confirmation", async () => {
    const client = mockClient();
    client.appendToNote.mockResolvedValue(undefined);
    const res = await appendToNoteHandler({ noteId: "n1", fragment: "<p>y</p>" }, client);
    expect(client.appendToNote).toHaveBeenCalledWith("n1", "<p>y</p>");
    expect((res.content[0] as { text: string }).text).toContain("n1");
  });
});

describe("move_note handler", () => {
  it("delegates to client.moveNote", async () => {
    const client = mockClient();
    client.moveNote.mockResolvedValue({ branchId: "b2", parentNoteId: "p2" });
    const res = await moveNoteHandler({ noteId: "n1", toParentNoteId: "p2" }, client);
    expect(client.moveNote).toHaveBeenCalledWith("n1", "p2", { notePosition: undefined, prefix: undefined });
    expect(JSON.parse((res.content[0] as { text: string }).text).parentNoteId).toBe("p2");
  });
});

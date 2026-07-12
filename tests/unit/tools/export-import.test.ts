import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { exportNoteSubtreeHandler, importNoteZipHandler } from "../../../src/tools/export-import.js";

beforeEach(resetMockStore);

describe("export_note_subtree handler", () => {
  it("returns base64 of the exported buffer and passes noteId + format", async () => {
    const client = mockClient();
    client.exportNoteSubtree.mockResolvedValue(Buffer.from("hello", "utf8"));
    const res = await exportNoteSubtreeHandler({ noteId: "root", format: "markdown" }, client);
    expect(client.exportNoteSubtree).toHaveBeenCalledWith("root", "markdown");
    expect((res.content[0] as { text: string }).text).toBe(Buffer.from("hello").toString("base64"));
  });

  it("defaults format to html when omitted", async () => {
    const client = mockClient();
    client.exportNoteSubtree.mockResolvedValue(Buffer.from("hello", "utf8"));
    await exportNoteSubtreeHandler({ noteId: "root" }, client);
    expect(client.exportNoteSubtree).toHaveBeenCalledWith("root", "html");
  });
});

describe("import_note_zip handler", () => {
  it("decodes base64 to bytes and delegates to client.importNoteZip", async () => {
    const client = mockClient();
    client.importNoteZip.mockResolvedValue({ note: { noteId: "imp1" }, branch: { branchId: "br1" } });
    const b64 = Buffer.from("hello", "utf8").toString("base64");
    const res = await importNoteZipHandler({ noteId: "root", base64: b64 }, client);
    expect(client.importNoteZip).toHaveBeenCalledWith("root", Buffer.from("hello"));
    expect(JSON.parse((res.content[0] as { text: string }).text).note.noteId).toBe("imp1");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import {
  createAttachmentHandler,
  getAttachmentHandler,
  listNoteAttachmentsHandler,
  updateAttachmentHandler,
  deleteAttachmentHandler,
  getAttachmentContentHandler,
  setAttachmentContentHandler,
} from "../../../src/tools/attachments.js";

beforeEach(resetMockStore);

describe("create_attachment handler", () => {
  it("creates metadata", async () => {
    const client = mockClient();
    client.createAttachment.mockResolvedValue({ attachmentId: "at1" });
    const res = await createAttachmentHandler({ ownerId: "n1", role: "image", mime: "image/png", title: "t", position: 0 }, client);
    expect(client.createAttachment).toHaveBeenCalledWith({ ownerId: "n1", role: "image", mime: "image/png", title: "t", position: 0 });
    expect(JSON.parse((res.content[0] as { text: string }).text).attachmentId).toBe("at1");
  });
});

describe("get_attachment handler", () => {
  it("returns attachment metadata", async () => {
    const client = mockClient();
    client.getAttachment.mockResolvedValue({ attachmentId: "at1", title: "t" });
    const res = await getAttachmentHandler({ attachmentId: "at1" }, client);
    expect(client.getAttachment).toHaveBeenCalledWith("at1");
    expect(JSON.parse((res.content[0] as { text: string }).text).attachmentId).toBe("at1");
  });
});

describe("list_note_attachments handler", () => {
  it("returns the note's attachments as JSON", async () => {
    const client = mockClient();
    client.listNoteAttachments.mockResolvedValue([{ attachmentId: "at1" }, { attachmentId: "at2" }]);
    const res = await listNoteAttachmentsHandler({ noteId: "n1" }, client);
    expect(client.listNoteAttachments).toHaveBeenCalledWith("n1");
    expect(JSON.parse((res.content[0] as { text: string }).text)).toHaveLength(2);
  });
});

describe("update_attachment handler", () => {
  it("passes the patch (minus attachmentId) to client.updateAttachment", async () => {
    const client = mockClient();
    client.updateAttachment.mockResolvedValue({ attachmentId: "at1", title: "new" });
    const res = await updateAttachmentHandler({ attachmentId: "at1", title: "new", position: 5 }, client);
    expect(client.updateAttachment).toHaveBeenCalledWith("at1", { title: "new", position: 5 });
    expect(JSON.parse((res.content[0] as { text: string }).text).title).toBe("new");
  });
});

describe("delete_attachment handler", () => {
  it("deletes and confirms", async () => {
    const client = mockClient();
    client.deleteAttachment.mockResolvedValue(undefined);
    const res = await deleteAttachmentHandler({ attachmentId: "at1" }, client);
    expect(client.deleteAttachment).toHaveBeenCalledWith("at1");
    expect((res.content[0] as { text: string }).text).toContain("at1");
  });
});

describe("attachment content base64 round-trip", () => {
  it("get returns base64 of the buffer", async () => {
    const client = mockClient();
    client.getAttachmentContent.mockResolvedValue(Buffer.from("hello", "utf8"));
    const res = await getAttachmentContentHandler({ attachmentId: "at1" }, client);
    expect((res.content[0] as { text: string }).text).toBe(Buffer.from("hello").toString("base64"));
  });
  it("set decodes base64 to bytes", async () => {
    const client = mockClient();
    client.setAttachmentContent.mockResolvedValue(undefined);
    const b64 = Buffer.from("hello").toString("base64");
    await setAttachmentContentHandler({ attachmentId: "at1", base64: b64 }, client);
    expect(client.setAttachmentContent).toHaveBeenCalledWith("at1", Buffer.from("hello"));
  });
});

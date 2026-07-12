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

describeIntegration("attachments (integration)", () => {
  let client: EtapiClient;
  let rootId: string;
  let noteId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
    noteId = (
      await client.createNote({ parentNoteId: rootId, title: "att-host", type: "text", content: "" })
    ).note.noteId;
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("create → list → content → update → delete", async () => {
    const att = await client.createAttachment({
      ownerId: noteId,
      role: "file",
      mime: "text/plain",
      title: "t.txt",
      position: 0,
      content: "hello",
    });
    expect(att.attachmentId).toBeTruthy();

    const list = await client.listNoteAttachments(noteId);
    expect(list.some((a) => a.attachmentId === att.attachmentId)).toBe(true);

    await client.setAttachmentContent(att.attachmentId, Buffer.from("world", "utf8"));
    const buf = await client.getAttachmentContent(att.attachmentId);
    expect(buf.toString("utf8")).toBe("world");

    const updated = await client.updateAttachment(att.attachmentId, { title: "renamed.txt" });
    expect(updated.title).toBe("renamed.txt");

    await client.deleteAttachment(att.attachmentId);
    await expect(client.getAttachment(att.attachmentId)).rejects.toMatchObject({
      code: "ATTACHMENT_NOT_FOUND",
    });
  });
});

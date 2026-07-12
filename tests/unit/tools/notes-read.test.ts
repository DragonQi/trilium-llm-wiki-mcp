import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { getNoteHandler, getAppInfoHandler, getNoteContentHandler } from "../../../src/tools/notes-read.js";

beforeEach(resetMockStore);

describe("get_note handler", () => {
  it("returns note JSON", async () => {
    const client = mockClient();
    client.getNote.mockResolvedValue({ noteId: "n1", title: "X" });
    const res = await getNoteHandler({ noteId: "n1" }, client);
    expect(client.getNote).toHaveBeenCalledWith("n1");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("n1");
  });
});

describe("get_note_content handler", () => {
  it("returns raw text", async () => {
    const client = mockClient();
    client.getNoteContent.mockResolvedValue("<p>hi</p>");
    const res = await getNoteContentHandler({ noteId: "n1" }, client);
    expect((res.content[0] as { text: string }).text).toBe("<p>hi</p>");
  });
});

describe("get_app_info handler", () => {
  it("returns app info JSON", async () => {
    const client = mockClient();
    client.getAppInfo.mockResolvedValue({ appVersion: "0.50.2" });
    const res = await getAppInfoHandler({}, client);
    expect(JSON.parse((res.content[0] as { text: string }).text).appVersion).toBe("0.50.2");
  });
});

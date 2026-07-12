import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { createNoteRevisionHandler } from "../../../src/tools/revisions.js";

beforeEach(resetMockStore);

describe("create_note_revision handler", () => {
  it("delegates to client.createNoteRevision", async () => {
    const client = mockClient();
    client.createNoteRevision.mockResolvedValue(undefined);
    const res = await createNoteRevisionHandler({ noteId: "n1" }, client);
    expect(client.createNoteRevision).toHaveBeenCalledWith("n1");
    expect((res.content[0] as { text: string }).text).toContain("n1");
  });
});

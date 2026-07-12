import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { cloneNoteHandler, deleteBranchHandler } from "../../../src/tools/branches.js";

beforeEach(resetMockStore);

describe("clone_note handler", () => {
  it("creates a branch under the new parent", async () => {
    const client = mockClient();
    client.createBranch.mockResolvedValue({ branchId: "br1", parentNoteId: "p2" });
    const res = await cloneNoteHandler({ noteId: "n1", parentNoteId: "p2" }, client);
    expect(client.createBranch).toHaveBeenCalledWith({ noteId: "n1", parentNoteId: "p2", prefix: undefined, notePosition: undefined });
    expect(JSON.parse((res.content[0] as { text: string }).text).branchId).toBe("br1");
  });
});

describe("delete_branch handler", () => {
  it("deletes and confirms", async () => {
    const client = mockClient();
    client.deleteBranch.mockResolvedValue(undefined);
    const res = await deleteBranchHandler({ branchId: "br1" }, client);
    expect(client.deleteBranch).toHaveBeenCalledWith("br1");
    expect((res.content[0] as { text: string }).text).toContain("br1");
  });
});

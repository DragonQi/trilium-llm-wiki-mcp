import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { searchNotesHandler } from "../../../src/tools/search.js";

beforeEach(resetMockStore);

describe("search_notes handler", () => {
  it("calls client.searchNotes and returns JSON text", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "a", title: "T" }]);
    const res = await searchNotesHandler({ query: "T", limit: 5 }, client);
    expect(client.searchNotes).toHaveBeenCalledWith({ search: "T", limit: 5 });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse((res.content[0] as { text: string }).text);
    expect(parsed[0].noteId).toBe("a");
  });

  it("surfaces EtapiError as isError", async () => {
    const { EtapiError } = await import("../../../src/lib/errors.js");
    const client = mockClient();
    client.searchNotes.mockRejectedValue(
      new EtapiError({ status: 400, code: "SEARCH_QUERY_PARAM_MANDATORY", message: "need q" }),
    );
    const res = await searchNotesHandler({ query: "", limit: 5 }, client);
    expect(res.isError).toBe(true);
  });
});

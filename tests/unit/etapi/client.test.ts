import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeFetchMock } from "../../helpers/etapiFetchMock.js";
import { loadConfig } from "../../../src/lib/config.js";
import { EtapiClient } from "../../../src/etapi/client.js";
import type { Note, Attribute, Branch } from "../../../src/etapi/types.js";

let fetchMock: ReturnType<typeof makeFetchMock>;

beforeEach(() => {
  fetchMock = makeFetchMock([]);
  vi.stubGlobal("fetch", fetchMock.stub);
});
afterEach(() => vi.unstubAllGlobals());

function makeClient(): EtapiClient {
  const cfg = loadConfig({
    TRILIUM_URL: "http://t:8080",
    TRILIUM_TOKEN: "tok",
    TRILIUM_TIMEOUT: "1000",
  });
  return new EtapiClient(cfg);
}

describe("EtapiClient engine", () => {
  it("sends Authorization header without Bearer and builds /etapi URL", async () => {
    fetchMock.routes = [{ match: /\/etapi\/app-info$/, respond: { body: { appVersion: "1" } } }];
    const client = makeClient();
    // @ts-expect-error accessing protected engine for test
    await client.request<void>("GET", "/app-info");
    const init = fetchMock.calls[0]!.init!;
    expect((init.headers as Record<string, string>).Authorization).toBe("tok");
    expect(fetchMock.calls[0]!.url).toBe("http://t:8080/etapi/app-info");
  });

  it("throws EtapiError on 4xx with code+message", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/bad$/,
        respond: { status: 404, body: { status: 404, code: "NOTE_NOT_FOUND", message: "no" } },
      },
    ];
    const client = makeClient();
    await expect(
      // @ts-expect-error: protected engine accessed directly in test
      client.request<void>("GET", "/notes/bad"),
    ).rejects.toMatchObject({ status: 404, code: "NOTE_NOT_FOUND", message: "no" });
  });

  it("retries once on 503 for idempotent GET", async () => {
    let tries = 0;
    fetchMock.routes = [
      {
        match: /\/app-info$/,
        respond: () => {
          tries++;
          return tries === 1
            ? { status: 503, body: { status: 503, code: "GENERIC", message: "x" } }
            : { body: { appVersion: "1" } };
        },
      },
    ];
    const client = makeClient();
    // @ts-expect-error: protected engine accessed directly in test
    const v = await client.request<{ appVersion: string }>("GET", "/app-info");
    expect(v.appVersion).toBe("1");
    expect(tries).toBe(2);
  });
});

describe("EtapiClient direct methods", () => {
  it("searchNotes passes params and returns results[]", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\?search=towers/,
        method: "GET",
        respond: { body: { results: [{ noteId: "a", title: "T" } as Note] } },
      },
    ];
    const client = makeClient();
    const out = await client.searchNotes({ search: "towers", limit: 5 });
    expect(out).toHaveLength(1);
    expect(fetchMock.calls[0]!.url).toContain("search=towers");
    expect(fetchMock.calls[0]!.url).toContain("limit=5");
  });

  it("createNote POSTs to /create-note", async () => {
    fetchMock.routes = [
      {
        match: /\/create-note$/,
        method: "POST",
        respond: {
          status: 201,
          body: { note: { noteId: "n1" } as Note, branch: { branchId: "b1" } as Branch },
        },
      },
    ];
    const client = makeClient();
    const r = await client.createNote({
      parentNoteId: "root",
      title: "X",
      type: "text",
      content: "<p>x</p>",
    });
    expect(r.note.noteId).toBe("n1");
    expect(fetchMock.calls[0]!.init!.method).toBe("POST");
    expect(fetchMock.calls[0]!.url).toBe("http://t:8080/etapi/create-note");
  });

  it("updateNoteContent PUTs text/plain body", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = makeClient();
    await expect(client.updateNoteContent("n1", "<p>new</p>")).resolves.toBeUndefined();
  });

  it("createAttribute POSTs to /attributes", async () => {
    fetchMock.routes = [
      {
        match: /\/attributes$/,
        method: "POST",
        respond: {
          status: 201,
          body: { attributeId: "a1", type: "label", name: "k", value: "v" } as Attribute,
        },
      },
    ];
    const client = makeClient();
    const a = await client.createAttribute({ noteId: "n1", type: "label", name: "k", value: "v" });
    expect(a.attributeId).toBe("a1");
  });

  it("createBranch POSTs to /branches", async () => {
    fetchMock.routes = [
      {
        match: /\/branches$/,
        method: "POST",
        respond: {
          status: 201,
          body: { branchId: "br1", noteId: "n1", parentNoteId: "root" } as Branch,
        },
      },
    ];
    const client = makeClient();
    const b = await client.createBranch({ noteId: "n1", parentNoteId: "root" });
    expect(b.branchId).toBe("br1");
  });

  it("getInboxNote hits /inbox/{date}", async () => {
    fetchMock.routes = [
      {
        match: /\/inbox\/2026-07-12$/,
        method: "GET",
        respond: { body: { noteId: "inbox" } as Note },
      },
    ];
    const client = makeClient();
    const n = await client.getInboxNote("2026-07-12");
    expect(n.noteId).toBe("inbox");
  });
});

describe("EtapiClient composite methods", () => {
  it("getNoteTree walks direct children", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/root$/,
        method: "GET",
        respond: { body: { noteId: "root", childNoteIds: ["c1", "c2"] } as Note },
      },
      { match: /\/notes\/c1$/, method: "GET", respond: { body: { noteId: "c1" } as Note } },
      { match: /\/notes\/c2$/, method: "GET", respond: { body: { noteId: "c2" } as Note } },
    ];
    const client = makeClient();
    const kids = await client.getNoteTree("root");
    expect(kids.map((n) => n.noteId)).toEqual(["c1", "c2"]);
  });

  it("getNoteAttributes reads embedded attributes", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/n1$/,
        method: "GET",
        respond: {
          body: {
            noteId: "n1",
            attributes: [{ attributeId: "a1", name: "k", value: "v", type: "label" } as Attribute],
          } as Note,
        },
      },
    ];
    const client = makeClient();
    const attrs = await client.getNoteAttributes("n1");
    expect(attrs[0]!.name).toBe("k");
  });

  it("upsertAttribute PATCHes existing label", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/n1$/,
        method: "GET",
        respond: {
          body: {
            noteId: "n1",
            attributes: [
              { attributeId: "a1", type: "label", name: "k", value: "old", position: 0 } as Attribute,
            ],
          } as Note,
        },
      },
      {
        match: /\/attributes\/a1$/,
        method: "PATCH",
        respond: { body: { attributeId: "a1", type: "label", name: "k", value: "new", position: 0 } as Attribute },
      },
    ];
    const client = makeClient();
    const a = await client.upsertAttribute({ noteId: "n1", type: "label", name: "k", value: "new" });
    expect(a.value).toBe("new");
    expect(fetchMock.calls.find((c) => c.method === "PATCH")).toBeTruthy();
  });

  it("upsertAttribute POSTs when label absent", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/n1$/,
        method: "GET",
        respond: { body: { noteId: "n1", attributes: [] } as Note },
      },
      {
        match: /\/attributes$/,
        method: "POST",
        respond: {
          status: 201,
          body: { attributeId: "a2", type: "label", name: "k", value: "v" } as Attribute,
        },
      },
    ];
    const client = makeClient();
    const a = await client.upsertAttribute({ noteId: "n1", type: "label", name: "k", value: "v" });
    expect(a.attributeId).toBe("a2");
  });

  it("appendToNote GETs then PUTs", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1\/content$/, method: "GET", respond: { body: "<p>a</p>" } },
      { match: /\/notes\/n1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = makeClient();
    await client.appendToNote("n1", "<p>b</p>");
    const putBody = fetchMock.calls.find((c) => c.method === "PUT")!.init!.body as string;
    expect(putBody).toBe("<p>a</p><p>b</p>");
  });

  it("moveNote deletes old branch and posts new", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/n1$/,
        method: "GET",
        respond: {
          body: { noteId: "n1", parentNoteIds: ["oldParent"], parentBranchIds: ["brOld"] } as Note,
        },
      },
      { match: /\/branches\/brOld$/, method: "DELETE", respond: { status: 204, body: "" } },
      {
        match: /\/branches$/,
        method: "POST",
        respond: {
          status: 201,
          body: { branchId: "brNew", noteId: "n1", parentNoteId: "newParent" } as Branch,
        },
      },
      { match: /\/refresh-note-ordering\/newParent$/, method: "POST", respond: { status: 204, body: "" } },
    ];
    const client = makeClient();
    const b = await client.moveNote("n1", "newParent");
    expect(b.parentNoteId).toBe("newParent");
    expect(fetchMock.calls.find((c) => c.method === "DELETE")).toBeTruthy();
  });

  it("getNotePath walks parents to root", async () => {
    fetchMock.routes = [
      {
        match: /\/notes\/child$/,
        method: "GET",
        respond: { body: { noteId: "child", parentNoteIds: ["mid"] } as Note },
      },
      {
        match: /\/notes\/mid$/,
        method: "GET",
        respond: { body: { noteId: "mid", parentNoteIds: ["root"] } as Note },
      },
      {
        match: /\/notes\/root$/,
        method: "GET",
        respond: { body: { noteId: "root", parentNoteIds: ["none"] } as Note },
      },
    ];
    const client = makeClient();
    const path = await client.getNotePath("child");
    expect(path.map((n) => n.noteId)).toEqual(["mid", "root"]);
  });
});

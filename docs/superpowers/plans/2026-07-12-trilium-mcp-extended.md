# Trilium MCP Extended (WF2 / Plan 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Execution note:** Tasks 5–12 (8 tool groups) are independent — each writes its own `src/tools/<group>.ts` + test file. They are the parallel fan-out for a Workflow run; Tasks 1–4 (client extension) must complete first, Task 13 (aggregation) after.

**Goal:** Extend `trilium-llm-wiki-mcp` from 19 to ~49 MCP tools: 24 direct ETAPI tools (attachments, branches/clone, export/import, calendar+, system, revision snapshot, attribute get/update) + 6 composite tools (upsert_note, get_backlinks, find_orphans, search_by_attribute, replace_note_section, bulk_set_attributes), all tested against the live Docker Trilium.

**Architecture:** Same three layers as Plan 1. The single `EtapiClient` (`src/etapi/client.ts`) gains binary helpers (export ZIP → Buffer; raw-bytes upload for import/attachment content), 24 direct methods, and 6 composite methods. New tool modules live in `src/tools/<group>.ts` following the Plan-1 pattern (testable handler + `register…(server, client)`). Graph core (`find_related`/`query_wiki`) is **deferred to Plan 2b**.

**Tech Stack:** unchanged — Node ≥18, TS 5, `@modelcontextprotocol/sdk@^1.29`, `zod@^3.25`, Vitest 2.

## Global Constraints (additions; Plan-1 constraints still apply)

- **Clean-room, MIT**, env-only config, Git Bash/POSIX, NodeNext ESM with `.js` import suffixes — all unchanged.
- **ETAPI gaps confirmed by research (non-goals — do NOT implement):** `GET /notes/{id}/revisions`, `GET /revisions/{id}`, `GET /revisions/{id}/content` (revisions not exposed over ETAPI at all); `POST /notes/{id}/undelete`, `GET /notes/history` (history not exposed). Tools `list_note_revisions`, `get_revision`, `get_revision_content`, `undelete_note`, `get_recent_changes` are **dropped** — document this in README non-goals. Only `create_note_revision` (snapshot, `POST /notes/{id}/revision` → 204) ships.
- **Binary over MCP:** ETAPI export returns a ZIP and import takes raw ZIP bytes, but MCP tool I/O is text. Encode binary as **base64 in a text content block** (`export_note_subtree` returns base64; `import_note_zip` accepts base64). The client deals in `Buffer`; the tool does the base64↔Buffer conversion.
- **Attachment content** is a plain JSON string on `POST /attachments` (text only); binary attachment bytes go via `PUT /attachments/{id}/content` with a **raw body** (not base64). `get_attachment_content` returns raw bytes → tool returns base64; `set_attachment_content` accepts base64 → raw upload.
- **Protected entities:** surface `400 NOTE_IS_PROTECTED` / `400 ATTACHMENT_IS_PROTECTED` as `isError` (already handled by `asToolResult`).
- **`PUT /backup/{name}`** failure is a bare 500 with **no JSON body** — the engine must tolerate a missing error envelope (fall back to `{status:500, code:"GENERIC", message:statusText}`).
- **Backlinks search** has no "any relation to X" wildcard — `get_backlinks` enumerates a configurable relation-name list (default: `derivedFrom`, `relatesTo`, `mentions`, `about`, `partOf`).
- **`GET /metrics`** and **`GET /calendar/week-first-day/{date}`** exist in routes but not `etapi.openapi.yaml` — implemented anyway (confirmed in source).

---

## File Structure (additions)

```
src/
├── etapi/
│   ├── client.ts        # MODIFY: +requestBuffer, +sendRaw, +24 direct, +6 composite methods
│   └── types.ts         # MODIFY: +Attachment, CreateAttachmentInput, BackupResult, MetricsFormat
├── lib/
│   └── base64.ts        # NEW: toBase64(Buffer)/fromBase64(string) helpers (shared by tools)
└── tools/
    ├── index.ts         # MODIFY: register 8 new groups
    ├── revisions.ts         # NEW — 1 tool
    ├── branches.ts          # NEW — 5 tools
    ├── attachments.ts       # NEW — 7 tools
    ├── attributes-extra.ts  # NEW — 2 tools (get_attribute, update_attribute)
    ├── export-import.ts     # NEW — 2 tools
    ├── calendar-extra.ts    # NEW — 3 tools
    ├── system.ts            # NEW — 4 tools
    └── composite.ts         # NEW — 6 tools
tests/
├── unit/etapi/client.test.ts                 # MODIFY: +tests for new direct/composite methods
├── unit/tools/{revisions,branches,attachments,attributes-extra,export-import,calendar-extra,system,composite}.test.ts  # NEW
└── integration/{attachments,export-import,calendar-extra,system,composite}.integration.test.ts  # NEW
```

**Responsibilities:** each new `src/tools/<group>.ts` owns exactly its tool group; the client owns all ETAPI I/O including binary; `lib/base64.ts` isolates Node `Buffer` base64 so tools stay thin.

---

## Task 1: ETAPI types extension

**Files:** Modify `src/etapi/types.ts`

**Interfaces:**
- Produces: `Attachment`, `CreateAttachmentInput`, `UpdateAttachmentInput`, `MetricsFormat`, `BackupResult` types consumed by Tasks 3–12.

- [ ] **Step 1: Append types to `src/etapi/types.ts`**

```ts
export type AttachmentRole = "image" | "file" | "content" | "embed" | (string & {});

export interface Attachment {
  attachmentId: string;
  ownerId: string;
  role: string;
  mime: string;
  title: string;
  position: number;
  blobId: string;
  dateModified: string;
  utcDateModified: string;
  utcDateScheduledForErasureSince: string | null;
  contentLength?: number;
}

export interface CreateAttachmentInput {
  ownerId: string;
  role: string;
  mime: string;
  title: string;
  position: number;
  content?: string; // plain string (text only); binary via setAttachmentContent
}

export type UpdateAttachmentInput = Pick<Attachment, "position"> &
  Partial<Pick<Attachment, "role" | "mime" | "title">>;

export type MetricsFormat = "prometheus" | "json";

export type ExportFormat = "html" | "markdown";
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/etapi/types.ts
git commit -m "feat(etapi): add Attachment/Metrics/Export types (WF2)"
```

---

## Task 2: ETAPI client — binary helpers + base64 util

**Files:** Modify `src/etapi/client.ts`; Create `src/lib/base64.ts`

**Interfaces:**
- Produces (on `EtapiClient`):
  - `protected requestBuffer(method, path, opts?): Promise<Buffer>` — like `request` but returns raw bytes (for export ZIP / attachment content). Same auth/timeout/error mapping.
  - `protected sendRaw(method, path, body: Buffer, contentType: string): Promise<void>` — sends raw bytes (for import / attachment content PUT). 204 → void; errors mapped.
- Produces: `toBase64(b: Buffer): string`, `fromBase64(s: string): Buffer` in `src/lib/base64.ts`.

- [ ] **Step 1: Create `src/lib/base64.ts`**

```ts
export function toBase64(b: Buffer): string {
  return b.toString("base64");
}

export function fromBase64(s: string): Buffer {
  return Buffer.from(s, "base64");
}
```

- [ ] **Step 2: Add binary helpers to `EtapiClient` (append after `requestText`)**

```ts
  protected async requestBuffer(
    method: string,
    path: string,
    opts: { query?: Record<string, string | undefined> } = {},
  ): Promise<Buffer> {
    const url = new URL(`${this.cfg.url}/etapi${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers: { Authorization: this.cfg.token },
        signal: ac.signal,
      });
      if (!resp.ok) {
        let payload: EtapiErrorPayload;
        try {
          payload = (await resp.json()) as EtapiErrorPayload;
        } catch {
          payload = { status: resp.status, code: "GENERIC", message: resp.statusText };
        }
        throw new EtapiError(payload);
      }
      return Buffer.from(await resp.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  protected async sendRaw(
    method: string,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const url = new URL(`${this.cfg.url}/etapi${path}`);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers: { Authorization: this.cfg.token, "Content-Type": contentType },
        body,
        signal: ac.signal,
      });
      if (!resp.ok && resp.status !== 204) {
        let payload: EtapiErrorPayload;
        try {
          payload = (await resp.json()) as EtapiErrorPayload;
        } catch {
          payload = { status: resp.status, code: "GENERIC", message: resp.statusText };
        }
        throw new EtapiError(payload);
      }
    } finally {
      clearTimeout(timer);
    }
  }
```

- [ ] **Step 3: Add unit tests for the binary helpers (append to `tests/unit/etapi/client.test.ts`)**

```ts
describe("EtapiClient binary helpers", () => {
  it("requestBuffer returns raw bytes", async () => {
    fetchMock.routes = [
      { match: /\/notes\/root\/export/, method: "GET", respond: { body: "PK\x03\x04ZIP" } },
    ];
    const client = makeClient();
    // @ts-expect-error: protected binary helper accessed in test
    const buf = await client.requestBuffer("GET", "/notes/root/export", { query: { format: "html" } });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toContain("ZIP");
  });

  it("sendRaw posts bytes and tolerates 204", async () => {
    fetchMock.routes = [
      { match: /\/attachments\/a1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = makeClient();
    // @ts-expect-error: protected binary helper accessed in test
    await expect(client.sendRaw("PUT", "/attachments/a1/content", Buffer.from("x"), "text/plain")).resolves.toBeUndefined();
  });
});
```

> The `requestBuffer` mock returns a string body; the mock's `text()`/`arrayBuffer()` must be supported. Extend `tests/helpers/etapiFetchMock.ts` to add `arrayBuffer()` to the Response stub:

```ts
async arrayBuffer() {
  const body = spec.body;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return new TextEncoder().encode(text).buffer;
},
```

- [ ] **Step 4: Run tests, build**

Run: `npm test -- tests/unit/etapi/client.test.ts && npm run build`
Expected: PASS (including 2 new binary tests); build clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/base64.ts src/etapi/client.ts tests/unit/etapi/client.test.ts tests/helpers/etapiFetchMock.ts
git commit -m "feat(etapi): binary helpers (requestBuffer/sendRaw) + base64 util (WF2)"
```

---

## Task 3: ETAPI client — direct methods (attachments / export-import / calendar+ / system / revision)

**Files:** Modify `src/etapi/client.ts`

**Interfaces:** Adds these methods on `EtapiClient` (consumed by Tasks 5–11):
- `createNoteRevision(noteId): Promise<void>`
- `createAttachment(i: CreateAttachmentInput): Promise<Attachment>`
- `getAttachment(id): Promise<Attachment>`
- `listNoteAttachments(noteId): Promise<Attachment[]>`
- `updateAttachment(id, patch: UpdateAttachmentInput): Promise<Attachment>`
- `deleteAttachment(id): Promise<void>`
- `getAttachmentContent(id): Promise<Buffer>`
- `setAttachmentContent(id, bytes: Buffer): Promise<void>`
- `exportNoteSubtree(noteId, format: ExportFormat): Promise<Buffer>`
- `importNoteZip(noteId, zipBytes: Buffer): Promise<CreateNoteResult>`
- `getWeekFirstDayNote(date): Promise<Note>`
- `getMonthNote(month): Promise<Note>`
- `getYearNote(year): Promise<Note>`
- `logout(): Promise<void>`
- `createBackup(name): Promise<void>`
- `getMetrics(format: MetricsFormat): Promise<string>`

(`getAttribute`, `updateAttribute`, `getBranch`, `createBranch`, `updateBranch`, `deleteBranch`, `refreshNoteOrdering` already exist from Plan 1.)

- [ ] **Step 1: Add methods (append to `EtapiClient`). Import `Attachment`, `CreateAttachmentInput`, `UpdateAttachmentInput`, `MetricsFormat`, `ExportFormat`, `CreateNoteResult` from `./types.js` at the top.**

```ts
  // ---- revisions (snapshot only; listing not exposed by ETAPI) ----
  createNoteRevision(noteId: string): Promise<void> {
    return this.request<void>("POST", `/notes/${encodeURIComponent(noteId)}/revision`);
  }

  // ---- attachments ----
  createAttachment(input: CreateAttachmentInput): Promise<Attachment> {
    return this.request<Attachment>("POST", "/attachments", { body: input });
  }
  getAttachment(attachmentId: string): Promise<Attachment> {
    return this.request<Attachment>("GET", `/attachments/${encodeURIComponent(attachmentId)}`);
  }
  listNoteAttachments(noteId: string): Promise<Attachment[]> {
    return this.request<Attachment[]>("GET", `/notes/${encodeURIComponent(noteId)}/attachments`);
  }
  updateAttachment(attachmentId: string, patch: UpdateAttachmentInput): Promise<Attachment> {
    return this.request<Attachment>("PATCH", `/attachments/${encodeURIComponent(attachmentId)}`, { body: patch });
  }
  deleteAttachment(attachmentId: string): Promise<void> {
    return this.request<void>("DELETE", `/attachments/${encodeURIComponent(attachmentId)}`);
  }
  getAttachmentContent(attachmentId: string): Promise<Buffer> {
    return this.requestBuffer("GET", `/attachments/${encodeURIComponent(attachmentId)}/content`);
  }
  setAttachmentContent(attachmentId: string, bytes: Buffer): Promise<void> {
    return this.sendRaw("PUT", `/attachments/${encodeURIComponent(attachmentId)}/content`, bytes, "application/octet-stream");
  }

  // ---- export / import ----
  exportNoteSubtree(noteId: string, format: ExportFormat = "html"): Promise<Buffer> {
    return this.requestBuffer("GET", `/notes/${encodeURIComponent(noteId)}/export`, { query: { format } });
  }
  importNoteZip(noteId: string, zipBytes: Buffer): Promise<CreateNoteResult> {
    return this.sendRaw("POST", `/notes/${encodeURIComponent(noteId)}/import`, zipBytes, "application/zip").then(
      // import returns 201 {note, branch} but sendRaw is typed void; re-fetch is awkward,
      // so implement import directly with a json-expecting path instead (see Step 2 fix).
      () => undefined as unknown as CreateNoteResult,
    );
  }

  // ---- calendar extras ----
  getWeekFirstDayNote(date: string): Promise<Note> {
    return this.request<Note>("GET", `/calendar/week-first-day/${encodeURIComponent(date)}`);
  }
  getMonthNote(month: string): Promise<Note> {
    return this.request<Note>("GET", `/calendar/months/${encodeURIComponent(month)}`);
  }
  getYearNote(year: string): Promise<Note> {
    return this.request<Note>("GET", `/calendar/years/${encodeURIComponent(year)}`);
  }

  // ---- system ----
  logout(): Promise<void> {
    return this.request<void>("POST", "/auth/logout");
  }
  createBackup(name: string): Promise<void> {
    return this.request<void>("PUT", `/backup/${encodeURIComponent(name)}`);
  }
  getMetrics(format: MetricsFormat = "json"): Promise<string> {
    return this.requestBuffer("GET", "/metrics", { query: { format } }).then((b) => b.toString("utf8"));
  }
```

- [ ] **Step 2: Fix `importNoteZip` (Step 1's sendRaw-then-cast is wrong — import returns JSON 201, not 204)**

Replace the `importNoteZip` method with a direct JSON POST of raw bytes. Because `request<T>` JSON-encodes its body, and import needs raw bytes, add a dedicated raw-JSON path:

```ts
  async importNoteZip(noteId: string, zipBytes: Buffer): Promise<CreateNoteResult> {
    const url = new URL(`${this.cfg.url}/etapi/notes/${encodeURIComponent(noteId)}/import`);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.cfg.token, "Content-Type": "application/zip" },
        body: zipBytes,
        signal: ac.signal,
      });
      if (!resp.ok) {
        let payload: EtapiErrorPayload;
        try {
          payload = (await resp.json()) as EtapiErrorPayload;
        } catch {
          payload = { status: resp.status, code: "GENERIC", message: resp.statusText };
        }
        throw new EtapiError(payload);
      }
      return (await resp.json()) as CreateNoteResult;
    } finally {
      clearTimeout(timer);
    }
  }
```

- [ ] **Step 3: Add unit tests for new direct methods (append)**

```ts
describe("EtapiClient WF2 direct methods", () => {
  it("createNoteRevision POSTs to /revision", async () => {
    fetchMock.routes = [{ match: /\/notes\/n1\/revision$/, method: "POST", respond: { status: 204, body: "" } }];
    const client = makeClient();
    await expect(client.createNoteRevision("n1")).resolves.toBeUndefined();
  });
  it("createAttachment POSTs JSON", async () => {
    fetchMock.routes = [
      { match: /\/attachments$/, method: "POST", respond: { status: 201, body: { attachmentId: "at1", ownerId: "n1" } as Attachment } },
    ];
    const client = makeClient();
    const a = await client.createAttachment({ ownerId: "n1", role: "image", mime: "image/png", title: "t", position: 0 });
    expect(a.attachmentId).toBe("at1");
  });
  it("listNoteAttachments returns array", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1\/attachments$/, method: "GET", respond: { body: [{ attachmentId: "at1" } as Attachment] } },
    ];
    const client = makeClient();
    const list = await client.listNoteAttachments("n1");
    expect(list).toHaveLength(1);
  });
  it("exportNoteSubtree returns Buffer", async () => {
    fetchMock.routes = [{ match: /\/notes\/root\/export/, method: "GET", respond: { body: "PKZIP" } }];
    const client = makeClient();
    const buf = await client.exportNoteSubtree("root", "markdown");
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
  it("getMonthNote hits /calendar/months/", async () => {
    fetchMock.routes = [{ match: /\/calendar\/months\/2026-07$/, method: "GET", respond: { body: { noteId: "m1" } as Note } }];
    const client = makeClient();
    const n = await client.getMonthNote("2026-07");
    expect(n.noteId).toBe("m1");
  });
  it("getMetrics returns text", async () => {
    fetchMock.routes = [{ match: /\/metrics\?format=json/, method: "GET", respond: { body: '{"version":"0.95.0"}' } }];
    const client = makeClient();
    const txt = await client.getMetrics("json");
    expect(txt).toContain("0.95.0");
  });
});
```

- [ ] **Step 4: Run tests, build**

Run: `npm test -- tests/unit/etapi/client.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/etapi/client.ts tests/unit/etapi/client.test.ts
git commit -m "feat(etapi): direct methods — attachments/export-import/calendar+/system/revision (WF2)"
```

---

## Task 4: ETAPI client — composite methods

**Files:** Modify `src/etapi/client.ts`

**Interfaces:** Adds:
- `upsertNote(input): Promise<{ note: Note; created: boolean }>` — search by exact title; if exactly one match → `updateNote`+`updateNoteContent`; else `createNote`.
- `getBacklinks(noteId, relationNames?: string[]): Promise<Note[]>` — for each relation name, `searchNotes({search: "~<name>.noteId = <noteId>"})`, merge + dedupe by noteId.
- `findOrphans(rootNoteId): Promise<Note[]>` — subtree notes (via `getNoteSubtree`) with zero backlinks (excluding the root).
- `replaceNoteSection(noteId, heading, newInnerHtml): Promise<void>` — GET content, regex-replace the section under `<hN>heading</hN>` up to the next same-or-higher level heading, PUT.
- `bulkSetAttributes(search, input): Promise<{ updated: string[] }>` — `searchNotes` then `upsertAttribute` on each.

- [ ] **Step 1: Add composite methods (append)**

```ts
  // ---- WF2 composite methods ----
  async upsertNote(input: {
    parentNoteId: string;
    title: string;
    type: CreateNoteInput["type"];
    content: string;
    mime?: string;
  }): Promise<{ note: Note; created: boolean }> {
    const hits = await this.searchNotes({ search: input.title });
    const exact = hits.find((n) => n.title === input.title);
    if (exact) {
      const note = await this.updateNote(exact.noteId, { title: input.title, type: input.type, mime: input.mime });
      await this.updateNoteContent(exact.noteId, input.content);
      return { note, created: false };
    }
    const r = await this.createNote({
      parentNoteId: input.parentNoteId,
      title: input.title,
      type: input.type,
      content: input.content,
      mime: input.mime,
    });
    return { note: r.note, created: true };
  }

  async getBacklinks(noteId: string, relationNames?: string[]): Promise<Note[]> {
    const names = relationNames ?? ["derivedFrom", "relatesTo", "mentions", "about", "partOf"];
    const seen = new Map<string, Note>();
    for (const name of names) {
      const hits = await this.searchNotes({ search: `~${name}.noteId = ${noteId}` });
      for (const n of hits) if (!seen.has(n.noteId)) seen.set(n.noteId, n);
    }
    return [...seen.values()];
  }

  async findOrphans(rootNoteId: string): Promise<Note[]> {
    const subtree = await this.getNoteSubtree(rootNoteId, { maxNodes: 200 });
    const flat: Note[] = [];
    const walk = (node: SubtreeNode): void => {
      flat.push(node.note);
      node.children.forEach(walk);
    };
    walk(subtree);
    const orphans: Note[] = [];
    for (const note of flat) {
      if (note.noteId === rootNoteId) continue;
      const backlinks = await this.getBacklinks(note.noteId);
      if (backlinks.length === 0) orphans.push(note);
    }
    return orphans;
  }

  async replaceNoteSection(noteId: string, heading: string, newInnerHtml: string): Promise<void> {
    const html = await this.getNoteContent(noteId);
    // Match <hN>heading</hN> ... up to the next heading of same or higher level or end.
    const open = new RegExp(`(<h([1-6])>[^<]*${escapeRegExp(heading)}[^<]*</h\\2>)`, "i");
    const m = open.exec(html);
    if (!m) {
      // Section not found: append a new section at the end.
      const appended = `${html}<h2>${heading}</h2>${newInnerHtml}`;
      await this.updateNoteContent(noteId, appended);
      return;
    }
    const level = m[2]!;
    const startIdx = m.index! + m[0].length;
    const nextHeading = new RegExp(`<h([1-${level}])\\b`, "i");
    const tail = html.slice(startIdx);
    const next = nextHeading.exec(tail);
    const sectionEnd = next ? startIdx + next.index : html.length;
    const updated = html.slice(0, startIdx) + newInnerHtml + html.slice(sectionEnd);
    await this.updateNoteContent(noteId, updated);
  }

  async bulkSetAttributes(
    search: string,
    input: { type: "label" | "relation"; name: string; value?: string; isInheritable?: boolean },
  ): Promise<{ updated: string[] }> {
    const notes = await this.searchNotes({ search });
    const updated: string[] = [];
    for (const n of notes) {
      await this.upsertAttribute({ noteId: n.noteId, type: input.type, name: input.name, value: input.value, isInheritable: input.isInheritable });
      updated.push(n.noteId);
    }
    return { updated };
  }
```

Add a top-level helper (module scope, near `sleep`):
```ts
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 2: Add unit tests for composite methods (append)**

```ts
describe("EtapiClient WF2 composite methods", () => {
  it("upsertNote creates when no exact-title match", async () => {
    fetchMock.routes = [
      { match: /\/notes\?search=New/, method: "GET", respond: { body: { results: [] } } },
      { match: /\/create-note$/, method: "POST", respond: { status: 201, body: { note: { noteId: "n1" } as Note, branch: { branchId: "b1" } as Branch } } },
    ];
    const client = makeClient();
    const r = await client.upsertNote({ parentNoteId: "root", title: "New", type: "text", content: "<p>x</p>" });
    expect(r.created).toBe(true);
    expect(r.note.noteId).toBe("n1");
  });

  it("upsertNote updates when exact-title match exists", async () => {
    fetchMock.routes = [
      { match: /\/notes\?search=Existing/, method: "GET", respond: { body: { results: [{ noteId: "e1", title: "Existing" } as Note] } } },
      { match: /\/notes\/e1$/, method: "PATCH", respond: { body: { noteId: "e1", title: "Existing" } as Note } },
      { match: /\/notes\/e1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = makeClient();
    const r = await client.upsertNote({ parentNoteId: "root", title: "Existing", type: "text", content: "<p>y</p>" });
    expect(r.created).toBe(false);
  });

  it("getBacklinks dedupes across relation names", async () => {
    fetchMock.routes = [
      { match: /~derivedFrom\.noteId=t/, method: "GET", respond: { body: { results: [{ noteId: "a" } as Note] } } },
      { match: /~relatesTo\.noteId=t/, method: "GET", respond: { body: { results: [{ noteId: "a" }, { noteId: "b" } as Note] } } },
      { match: /~mentions\.noteId=t/, method: "GET", respond: { body: { results: [] } } },
      { match: /~about\.noteId=t/, method: "GET", respond: { body: { results: [] } } },
      { match: /~partOf\.noteId=t/, method: "GET", respond: { body: { results: [] } } },
    ];
    const client = makeClient();
    const bl = await client.getBacklinks("t");
    expect(bl.map((n) => n.noteId).sort()).toEqual(["a", "b"]);
  });

  it("bulkSetAttributes upserts across matched notes", async () => {
    fetchMock.routes = [
      { match: /\/notes\?search=%23status/, method: "GET", respond: { body: { results: [{ noteId: "n1" } as Note, { noteId: "n2" } as Note] } } },
      { match: /\/notes\/n1$/, method: "GET", respond: { body: { noteId: "n1", attributes: [] } as Note } },
      { match: /\/notes\/n2$/, method: "GET", respond: { body: { noteId: "n2", attributes: [] } as Note } },
      { match: /\/attributes$/, method: "POST", respond: { status: 201, body: { attributeId: "x" } as Attribute } },
    ];
    const client = makeClient();
    const r = await client.bulkSetAttributes("#status", { type: "label", name: "status", value: "weak" });
    expect(r.updated.sort()).toEqual(["n1", "n2"]);
  });
});
```

- [ ] **Step 3: Run tests, build**

Run: `npm test -- tests/unit/etapi/client.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 4: Commit**

```bash
git add src/etapi/client.ts tests/unit/etapi/client.test.ts
git commit -m "feat(etapi): composite methods — upsert_note/backlinks/orphans/section/bulk (WF2)"
```

---

> **PARALLEL FAN-OUT (Tasks 5–12):** each task below creates one `src/tools/<group>.ts` + one `tests/unit/tools/<group>.test.ts`. They share no files. In a Workflow run, dispatch these 8 as parallel agents; each is self-contained given Tasks 1–4 are merged. After all 8 land, Task 13 aggregates them.

## Task 5: Tools — revisions (1)

**Files:** Create `src/tools/revisions.ts`, `tests/unit/tools/revisions.test.ts`

- [ ] **Step 1: Implement `src/tools/revisions.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function createNoteRevisionHandler(
  args: { noteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createNoteRevision(args.noteId), () => `Created revision snapshot of ${args.noteId}`);
}

export function registerRevisions(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "create_note_revision",
    {
      description:
        "Create a revision snapshot of a note's current state (ETAPI exposes only snapshot creation; listing/reading revisions is not supported).",
      inputSchema: { noteId: z.string() },
    },
    (a) => createNoteRevisionHandler(a as { noteId: string }, client),
  );
}
```

- [ ] **Step 2: Test + register pattern (use the mockClient helper from Plan 1)**

`tests/unit/tools/revisions.test.ts`:
```ts
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
```

- [ ] **Step 3: Run, build, commit**

```bash
npm test -- tests/unit/tools/revisions.test.ts && npm run build && npm run lint
git add src/tools/revisions.ts tests/unit/tools/revisions.test.ts
git commit -m "feat(tools): revisions group — create_note_revision (WF2)"
```

---

## Task 6: Tools — branches/clone (5)

**Files:** Create `src/tools/branches.ts`, `tests/unit/tools/branches.test.ts`

- [ ] **Step 1: Implement `src/tools/branches.ts`** (5 tools; all delegate to existing client methods `getBranch`/`createBranch`/`updateBranch`/`deleteBranch`/`refreshNoteOrdering`)

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function cloneNoteHandler(
  args: { noteId: string; parentNoteId: string; prefix?: string; notePosition?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.createBranch({ noteId: args.noteId, parentNoteId: args.parentNoteId, prefix: args.prefix, notePosition: args.notePosition }),
    (b) => JSON.stringify(b),
  );
}
export async function getBranchHandler(args: { branchId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getBranch(args.branchId), (b) => JSON.stringify(b));
}
export async function updateBranchHandler(
  args: { branchId: string; notePosition?: number; prefix?: string; isExpanded?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { branchId, ...patch } = args;
  return asToolResult(() => client.updateBranch(branchId, patch), (b) => JSON.stringify(b));
}
export async function deleteBranchHandler(args: { branchId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteBranch(args.branchId), () => `Deleted branch ${args.branchId}`);
}
export async function refreshNoteOrderingHandler(
  args: { parentNoteId: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.refreshNoteOrdering(args.parentNoteId), () => `Refreshed ordering under ${args.parentNoteId}`);
}

export function registerBranches(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "clone_note",
    {
      description: "Clone a note under another parent (creates a new branch; original stays).",
      inputSchema: {
        noteId: z.string(),
        parentNoteId: z.string(),
        prefix: z.string().optional(),
        notePosition: z.number().int().optional(),
      },
    },
    (a) => cloneNoteHandler(a as Parameters<typeof cloneNoteHandler>[0], client),
  );
  server.registerTool("get_branch", { description: "Get a branch placement by id.", inputSchema: { branchId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getBranchHandler(a as { branchId: string }, client));
  server.registerTool("update_branch", { description: "Update a branch (notePosition/prefix/isExpanded).", inputSchema: { branchId: z.string(), notePosition: z.number().int().optional(), prefix: z.string().optional(), isExpanded: z.boolean().optional() } }, (a) => updateBranchHandler(a as Parameters<typeof updateBranchHandler>[0], client));
  server.registerTool("delete_branch", { description: "Delete a branch placement (idempotent). Deleting the last branch deletes the note.", inputSchema: { branchId: z.string() } }, (a) => deleteBranchHandler(a as { branchId: string }, client));
  server.registerTool("refresh_note_ordering", { description: "Push updated child positions to connected clients.", inputSchema: { parentNoteId: z.string() } }, (a) => refreshNoteOrderingHandler(a as { parentNoteId: string }, client));
}
```

- [ ] **Step 2: Test (representative: clone_note + delete_branch)**

`tests/unit/tools/branches.test.ts`:
```ts
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
```

- [ ] **Step 3: Run, build, commit**

```bash
npm test -- tests/unit/tools/branches.test.ts && npm run build && npm run lint
git add src/tools/branches.ts tests/unit/tools/branches.test.ts
git commit -m "feat(tools): branches/clone group — 5 tools (WF2)"
```

---

## Task 7: Tools — attachments (7)

**Files:** Create `src/tools/attachments.ts`, `tests/unit/tools/attachments.test.ts`

- [ ] **Step 1: Implement `src/tools/attachments.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { toBase64, fromBase64 } from "../lib/base64.js";

export async function createAttachmentHandler(
  args: { ownerId: string; role: string; mime: string; title: string; position: number; content?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createAttachment(args), (a) => JSON.stringify(a));
}
export async function getAttachmentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getAttachment(args.attachmentId), (a) => JSON.stringify(a));
}
export async function listNoteAttachmentsHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.listNoteAttachments(args.noteId), (list) => JSON.stringify(list));
}
export async function updateAttachmentHandler(
  args: { attachmentId: string; title?: string; role?: string; mime?: string; position?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { attachmentId, ...patch } = args;
  return asToolResult(() => client.updateAttachment(attachmentId, patch), (a) => JSON.stringify(a));
}
export async function deleteAttachmentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteAttachment(args.attachmentId), () => `Deleted attachment ${args.attachmentId}`);
}
export async function getAttachmentContentHandler(args: { attachmentId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(
    () => client.getAttachmentContent(args.attachmentId).then((b) => toBase64(b)),
    (b64) => b64,
  );
}
export async function setAttachmentContentHandler(
  args: { attachmentId: string; base64: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.setAttachmentContent(args.attachmentId, fromBase64(args.base64)), () =>
    `Set content of attachment ${args.attachmentId}`,
  );
}

export function registerAttachments(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "create_attachment",
    {
      description:
        "Create an attachment metadata record (text content only via 'content'; upload binary with set_attachment_content).",
      inputSchema: {
        ownerId: z.string().describe(" Owning note id"),
        role: z.string().describe("image | file | content | embed"),
        mime: z.string(),
        title: z.string(),
        position: z.number().int(),
        content: z.string().optional(),
      },
    },
    (a) => createAttachmentHandler(a as Parameters<typeof createAttachmentHandler>[0], client),
  );
  server.registerTool("get_attachment", { description: "Get attachment metadata.", inputSchema: { attachmentId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttachmentHandler(a as { attachmentId: string }, client));
  server.registerTool("list_note_attachments", { description: "List attachments owned by a note.", inputSchema: { noteId: z.string() }, annotations: { readOnlyHint: true } }, (a) => listNoteAttachmentsHandler(a as { noteId: string }, client));
  server.registerTool("update_attachment", { description: "Update attachment metadata (title/role/mime/position).", inputSchema: { attachmentId: z.string(), title: z.string().optional(), role: z.string().optional(), mime: z.string().optional(), position: z.number().int().optional() } }, (a) => updateAttachmentHandler(a as Parameters<typeof updateAttachmentHandler>[0], client));
  server.registerTool("delete_attachment", { description: "Delete an attachment (idempotent).", inputSchema: { attachmentId: z.string() } }, (a) => deleteAttachmentHandler(a as { attachmentId: string }, client));
  server.registerTool("get_attachment_content", { description: "Get attachment bytes as base64.", inputSchema: { attachmentId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttachmentContentHandler(a as { attachmentId: string }, client));
  server.registerTool("set_attachment_content", { description: "Replace attachment bytes from base64.", inputSchema: { attachmentId: z.string(), base64: z.string() } }, (a) => setAttachmentContentHandler(a as { attachmentId: string; base64: string }, client));
}
```

- [ ] **Step 2: Test (representative: create_attachment + get_attachment_content base64 round-trip)**

`tests/unit/tools/attachments.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { createAttachmentHandler, getAttachmentContentHandler, setAttachmentContentHandler } from "../../../src/tools/attachments.js";

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
```

- [ ] **Step 3: Run, build, commit**

```bash
npm test -- tests/unit/tools/attachments.test.ts && npm run build && npm run lint
git add src/tools/attachments.ts tests/unit/tools/attachments.test.ts
git commit -m "feat(tools): attachments group — 7 tools (WF2)"
```

---

## Task 8: Tools — attributes-extra (2)

**Files:** Create `src/tools/attributes-extra.ts`, `tests/unit/tools/attributes-extra.test.ts`

- [ ] **Step 1: Implement** (delegates to existing `client.getAttribute` / `client.updateAttribute`)

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function getAttributeHandler(args: { attributeId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getAttribute(args.attributeId), (a) => JSON.stringify(a));
}
export async function updateAttributeHandler(
  args: { attributeId: string; value?: string; position?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  const { attributeId, ...patch } = args;
  return asToolResult(() => client.updateAttribute(attributeId, patch), (a) => JSON.stringify(a));
}

export function registerAttributesExtra(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_attribute", { description: "Get a single attribute by id.", inputSchema: { attributeId: z.string() }, annotations: { readOnlyHint: true } }, (a) => getAttributeHandler(a as { attributeId: string }, client));
  server.registerTool("update_attribute", { description: "Update an attribute (label: value/position; relation: position).", inputSchema: { attributeId: z.string(), value: z.string().optional(), position: z.number().int().optional() } }, (a) => updateAttributeHandler(a as Parameters<typeof updateAttributeHandler>[0], client));
}
```

- [ ] **Step 2: Test + Step 3: Run/build/commit** — follow the Plan-1 attributes test pattern; one test per handler asserting the client method is called with the right args. Commit message: `feat(tools): attributes-extra — get_attribute/update_attribute (WF2)`.

---

## Task 9: Tools — export/import (2)

**Files:** Create `src/tools/export-import.ts`, `tests/unit/tools/export-import.test.ts`

- [ ] **Step 1: Implement**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { toBase64, fromBase64 } from "../lib/base64.js";

export async function exportNoteSubtreeHandler(
  args: { noteId: string; format?: "html" | "markdown" },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.exportNoteSubtree(args.noteId, args.format ?? "html").then((b) => toBase64(b)),
    (b64) => b64,
  );
}
export async function importNoteZipHandler(
  args: { noteId: string; base64: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.importNoteZip(args.noteId, fromBase64(args.base64)), (r) => JSON.stringify(r));
}

export function registerExportImport(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "export_note_subtree",
    {
      description: "Export a note subtree as a base64-encoded ZIP (use noteId 'root' for the whole document). format: html (default) | markdown.",
      inputSchema: { noteId: z.string(), format: z.enum(["html", "markdown"]).optional() },
      annotations: { readOnlyHint: true },
    },
    (a) => exportNoteSubtreeHandler(a as Parameters<typeof exportNoteSubtreeHandler>[0], client),
  );
  server.registerTool(
    "import_note_zip",
    {
      description: "Import a base64-encoded ZIP into a note. Returns {note, branch} of the imported root.",
      inputSchema: { noteId: z.string(), base64: z.string() },
    },
    (a) => importNoteZipHandler(a as { noteId: string; base64: string }, client),
  );
}
```

- [ ] **Step 2: Test (export base64; import decodes)** — mirror attachments content test. Run/build/commit: `feat(tools): export/import group — 2 tools (WF2)`.

---

## Task 10: Tools — calendar-extra (3)

**Files:** Create `src/tools/calendar-extra.ts`, `tests/unit/tools/calendar-extra.test.ts`

- [ ] **Step 1: Implement**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const ym = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");
const y = z.string().regex(/^\d{4}$/, "YYYY");

export async function getWeekNoteByDateHandler(args: { date: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getWeekFirstDayNote(args.date), (n) => JSON.stringify(n));
}
export async function getMonthNoteHandler(args: { month: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getMonthNote(args.month), (n) => JSON.stringify(n));
}
export async function getYearNoteHandler(args: { year: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getYearNote(args.year), (n) => JSON.stringify(n));
}

export function registerCalendarExtra(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_week_note_by_date", { description: "Get (auto-create) the week note for the week containing YYYY-MM-DD.", inputSchema: { date: ymd }, annotations: { readOnlyHint: true } }, (a) => getWeekNoteByDateHandler(a as { date: string }, client));
  server.registerTool("get_month_note", { description: "Get (auto-create) the month note for YYYY-MM.", inputSchema: { month: ym }, annotations: { readOnlyHint: true } }, (a) => getMonthNoteHandler(a as { month: string }, client));
  server.registerTool("get_year_note", { description: "Get (auto-create) the year note for YYYY.", inputSchema: { year: y }, annotations: { readOnlyHint: true } }, (a) => getYearNoteHandler(a as { year: string }, client));
}
```

- [ ] **Step 2: Test + Run/build/commit** — `feat(tools): calendar-extra — week-by-date/month/year (WF2)`.

---

## Task 11: Tools — system (4)

**Files:** Create `src/tools/system.ts`, `tests/unit/tools/system.test.ts`

- [ ] **Step 1: Implement**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function loginHandler(args: { password: string; tokenName?: string }, _client: EtapiClient): Promise<CallToolResult> {
  // login is unauthenticated; call ETAPI directly rather than via the (token-bound) client.
  const url = process.env.TRILIUM_URL?.replace(/\/+$/, "") ?? "http://localhost:8080";
  return asToolResult(
    async () => {
      const res = await fetch(`${url}/etapi/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: args.password, tokenName: args.tokenName ?? "etapi" }),
      });
      if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
      return (await res.json()) as { authToken: string };
    },
    (r) => JSON.stringify(r),
  );
}
export async function logoutHandler(_args: Record<string, never>, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.logout(), () => "Logged out (token revoked)");
}
export async function createBackupHandler(args: { name: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.createBackup(args.name), () => `Created backup ${args.name}`);
}
export async function getMetricsHandler(args: { format?: "prometheus" | "json" }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getMetrics(args.format ?? "json"), (text) => text);
}

export function registerSystem(server: McpServer, client: EtapiClient): void {
  server.registerTool("login", { description: "Exchange a Trilium password for an ETAPI token (unauthenticated endpoint).", inputSchema: { password: z.string(), tokenName: z.string().optional() } }, (a) => loginHandler(a as Parameters<typeof loginHandler>[0], client));
  server.registerTool("logout", { description: "Revoke the current ETAPI token.", inputSchema: {} }, (a) => logoutHandler(a as Record<string, never>, client));
  server.registerTool("create_backup", { description: "Trigger a DB backup (name: [a-zA-Z0-9_]{1,32}).", inputSchema: { name: z.string().regex(/^[a-zA-Z0-9_]{1,32}$/) } }, (a) => createBackupHandler(a as { name: string }, client));
  server.registerTool("get_metrics", { description: "Instance metrics (format: json default | prometheus).", inputSchema: { format: z.enum(["prometheus", "json"]).optional() }, annotations: { readOnlyHint: true } }, (a) => getMetricsHandler(a as { format?: "prometheus" | "json" }, client));
}
```

- [ ] **Step 2: Test (logout/create_backup/get_metrics delegate; login uses fetch — stub global fetch)** + Run/build/commit: `feat(tools): system group — login/logout/backup/metrics (WF2)`.

---

## Task 12: Tools — composite (6)

**Files:** Create `src/tools/composite.ts`, `tests/unit/tools/composite.test.ts`

- [ ] **Step 1: Implement**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function upsertNoteHandler(
  args: { parentNoteId: string; title: string; type: "text" | "code" | "file" | "image" | "search" | "book" | "relationMap" | "render"; content: string; mime?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.upsertNote(args), (r) => JSON.stringify(r));
}
export async function getBacklinksHandler(
  args: { noteId: string; relations?: string[] },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.getBacklinks(args.noteId, args.relations), (notes) => JSON.stringify(notes));
}
export async function findOrphansHandler(args: { rootNoteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.findOrphans(args.rootNoteId), (notes) => JSON.stringify(notes));
}
export async function searchByAttributeHandler(args: { query: string; limit?: number }, client: EtapiClient): Promise<CallToolResult> {
  // 'query' is a Trilium attribute expression, e.g. '#status=weak' or '~author.noteId=abc'.
  return asToolResult(() => client.searchNotes({ search: args.query, limit: args.limit ?? 20 }), (notes) => JSON.stringify(notes));
}
export async function replaceNoteSectionHandler(
  args: { noteId: string; heading: string; newInnerHtml: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.replaceNoteSection(args.noteId, args.heading, args.newInnerHtml), () =>
    `Replaced section "${args.heading}" in ${args.noteId}`,
  );
}
export async function bulkSetAttributesHandler(
  args: { search: string; type: "label" | "relation"; name: string; value?: string; isInheritable?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.bulkSetAttributes(args.search, { type: args.type, name: args.name, value: args.value, isInheritable: args.isInheritable }),
    (r) => JSON.stringify(r),
  );
}

export function registerComposite(server: McpServer, client: EtapiClient): void {
  server.registerTool("upsert_note", { description: "Find a note by exact title and update it, or create it under parentNoteId. Anti-duplicate core of ingest.", inputSchema: { parentNoteId: z.string(), title: z.string(), type: z.enum(["text", "code", "file", "image", "search", "book", "relationMap", "render"]), content: z.string(), mime: z.string().optional() } }, (a) => upsertNoteHandler(a as Parameters<typeof upsertNoteHandler>[0], client));
  server.registerTool("get_backlinks", { description: "Find notes whose relations point TO a note. Backs the backlinks graph signal; enumerates relation names (default: derivedFrom, relatesTo, mentions, about, partOf).", inputSchema: { noteId: z.string(), relations: z.array(z.string()).optional() }, annotations: { readOnlyHint: true } }, (a) => getBacklinksHandler(a as Parameters<typeof getBacklinksHandler>[0], client));
  server.registerTool("find_orphans", { description: "Find notes in a subtree with zero incoming relations (orphan candidates).", inputSchema: { rootNoteId: z.string() }, annotations: { readOnlyHint: true } }, (a) => findOrphansHandler(a as { rootNoteId: string }, client));
  server.registerTool("search_by_attribute", { description: "Search notes by a Trilium attribute expression (e.g. '#status=weak', '~author.noteId=abc').", inputSchema: { query: z.string().min(1), limit: z.number().int().positive().max(500).optional() }, annotations: { readOnlyHint: true } }, (a) => searchByAttributeHandler(a as Parameters<typeof searchByAttributeHandler>[0], client));
  server.registerTool("replace_note_section", { description: "Replace the body under a heading (<hN>heading</hN>) with new HTML. Appends the section if absent. Avoids read-then-write of the whole note.", inputSchema: { noteId: z.string(), heading: z.string(), newInnerHtml: z.string() } }, (a) => replaceNoteSectionHandler(a as Parameters<typeof replaceNoteSectionHandler>[0], client));
  server.registerTool("bulk_set_attributes", { description: "Upsert a label/relation onto every note matched by a search expression.", inputSchema: { search: z.string(), type: z.enum(["label", "relation"]), name: z.string().regex(/^[^\s]+$/), value: z.string().optional(), isInheritable: z.boolean().optional() } }, (a) => bulkSetAttributesHandler(a as Parameters<typeof bulkSetAttributesHandler>[0], client));
}
```

- [ ] **Step 2: Test (upsert_note delegates; search_by_attribute passes query through)** + Run/build/commit: `feat(tools): composite group — upsert/backlinks/orphans/search-by-attr/section/bulk (WF2)`.

---

## Task 13: Aggregate all tools + registration test

**Files:** Modify `src/tools/index.ts`, `tests/unit/tools/index.test.ts`

- [ ] **Step 1: Update `registerAllTools`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtapiClient } from "../etapi/client.js";
import { registerSearch } from "./search.js";
import { registerRead } from "./notes-read.js";
import { registerWrite } from "./notes-write.js";
import { registerAttributes } from "./attributes.js";
import { registerCalendar } from "./calendar.js";
import { registerRevisions } from "./revisions.js";
import { registerBranches } from "./branches.js";
import { registerAttachments } from "./attachments.js";
import { registerAttributesExtra } from "./attributes-extra.js";
import { registerExportImport } from "./export-import.js";
import { registerCalendarExtra } from "./calendar-extra.js";
import { registerSystem } from "./system.js";
import { registerComposite } from "./composite.js";

export function registerAllTools(server: McpServer, client: EtapiClient): void {
  registerSearch(server, client);
  registerRead(server, client);
  registerWrite(server, client);
  registerAttributes(server, client);
  registerCalendar(server, client);
  registerRevisions(server, client);
  registerBranches(server, client);
  registerAttachments(server, client);
  registerAttributesExtra(server, client);
  registerExportImport(server, client);
  registerCalendarExtra(server, client);
  registerSystem(server, client);
  registerComposite(server, client);
}
```

- [ ] **Step 2: Extend the `EXPECTED` list in `tests/unit/tools/index.test.ts`** with the 30 new tool names:

```ts
const EXPECTED = [
  // WF1 (19)
  "search_notes","get_note","get_note_content","get_note_tree","get_note_subtree","get_note_path","get_app_info",
  "create_note","update_note","update_note_content","append_to_note","delete_note","move_note",
  "get_attributes","set_attribute","delete_attribute","get_day_note","get_week_note","get_inbox_note",
  // WF2 revisions (1)
  "create_note_revision",
  // WF2 branches (5)
  "clone_note","get_branch","update_branch","delete_branch","refresh_note_ordering",
  // WF2 attachments (7)
  "create_attachment","get_attachment","list_note_attachments","update_attachment","delete_attachment","get_attachment_content","set_attachment_content",
  // WF2 attributes-extra (2)
  "get_attribute","update_attribute",
  // WF2 export/import (2)
  "export_note_subtree","import_note_zip",
  // WF2 calendar-extra (3)
  "get_week_note_by_date","get_month_note","get_year_note",
  // WF2 system (4)
  "login","logout","create_backup","get_metrics",
  // WF2 composite (6)
  "upsert_note","get_backlinks","find_orphans","search_by_attribute","replace_note_section","bulk_set_attributes",
];
```

- [ ] **Step 3: Run all unit tests + build + lint**

Run: `npm test && npm run build && npm run lint`
Expected: all green; the index test now asserts 49 tools.

- [ ] **Step 4: Commit**

```bash
git add src/tools/index.ts tests/unit/tools/index.test.ts
git commit -m "feat(tools): aggregate 49 tools (WF1+WF2) + registration test (WF2)"
```

---

## Task 14: Integration tests for WF2 tools

**Files:** Create `tests/integration/{attachments,export-import,calendar-extra,system,composite}.integration.test.ts`

All use the `integrationEnabled` / `liveClient` / `ensureTestRoot` helpers from Plan 1 and clean up in `afterAll`.

- [ ] **Step 1: `attachments.integration.test.ts`** — create a text note, create an attachment (role image, mime text/plain, content "hello"), list attachments, get content (base64-decode equals "hello"), update title, delete.

- [ ] **Step 2: `export-import.integration.test.ts`** — create a note with content, `exportNoteSubtree` (Buffer, assert starts with ZIP magic `50 4B`), base64 round-trip is stable; skip import against the live DB to avoid polluting it (or import into the test root and delete).

- [ ] **Step 3: `calendar-extra.integration.test.ts`** — `getMonthNote("2026-07")`, `getYearNote("2026")`, `getWeekFirstDayNote("2026-07-12")` all return a noteId.

- [ ] **Step 4: `system.integration.test.ts`** — `getMetrics("json")` contains `version`; `createBackup("test")` resolves (then leave it; backups are harmless). Skip `logout` (would revoke the test token).

- [ ] **Step 5: `composite.integration.test.ts`** — under the test root: `upsertNote` twice with same title → second returns `created:false`; create two notes with a `relatesTo` relation between them → `getBacklinks` on the target returns the source; `searchByAttribute("#<testLabel>=<value>")` finds the labeled note; `replaceNoteSection` then read content contains the new section; `bulkSetAttributes` updates N matched notes.

Example (`attachments.integration.test.ts` skeleton):
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient, ensureTestRoot, cleanupTestRoot } from "../helpers/integration.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

describeIntegration("attachments (integration)", () => {
  let client: EtapiClient;
  let rootId: string;
  let noteId: string;
  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
    noteId = (await client.createNote({ parentNoteId: rootId, title: "att-host", type: "text", content: "" })).note.noteId;
  });
  afterAll(async () => { if (rootId) await cleanupTestRoot(client, rootId); });

  it("create → list → content → update → delete", async () => {
    const att = await client.createAttachment({ ownerId: noteId, role: "file", mime: "text/plain", title: "t.txt", position: 0, content: "hello" });
    const list = await client.listNoteAttachments(noteId);
    expect(list.some((a) => a.attachmentId === att.attachmentId)).toBe(true);
    // binary content round-trip via set/get
    await client.setAttachmentContent(att.attachmentId, Buffer.from("world", "utf8"));
    const buf = await client.getAttachmentContent(att.attachmentId);
    expect(buf.toString("utf8")).toBe("world");
    await client.deleteAttachment(att.attachmentId);
  });
});
```

- [ ] **Step 6: Run integration tests against the live Trilium**

Run: `npm run test:integration`
Expected: all WF1 (8) + WF2 integration tests green.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/
git commit -m "test: WF2 integration suite (attachments/export/calendar/system/composite) (WF2)"
```

---

## Self-Review (author's pre-handoff check)

**1. Spec coverage (WF2 scope):**
- §4.2 attachments (7): Task 7 ✓; branches/clone (5): Task 6 ✓; attributes-extra (2): Task 8 ✓; export/import (2): Task 9 ✓; revisions: only snapshot (Task 5) — list/get/get-content **dropped** (ETAPI gap, documented); history (undelete/recent-changes): **dropped** (ETAPI gap, documented); calendar+ (3): Task 10 ✓; system login/logout/backup/metrics (4): Task 11 ✓.
- §4.2 composite tools: upsert_note, get_backlinks, find_orphans, search_by_attribute, replace_note_section, bulk_set_attributes: Task 12 ✓. (`find_related`, `query_wiki`, `deep_research`, `resolve_review` → Plan 2b graph core.)
- §4.3 quality (zod schemas, typed, error mapping): all tools ✓.
- §6.2 integration tests per group: Task 14 ✓.

**2. Placeholder scan:** no TBD; each tool has real handler+register code; tests use the shared mockClient/integration helpers (DRY). Tasks 8/10/11/12 step 2 reference "follow the Plan-1 pattern" — the implementer reuses `mockClient` exactly as Tasks 5–7 show (concrete pattern, not "similar to").

**3. Type consistency:** client method names (`createAttachment`, `exportNoteSubtree`, `getBacklinks`, `upsertNote`, `replaceNoteSection`, `bulkSetAttributes`, `getWeekFirstDayNote`, `getMetrics`, `createNoteRevision`, …) match across client tests, handlers, and registrations. Tool names match the `EXPECTED` list (49 total). Binary flows use `Buffer` in the client and base64 at the tool boundary consistently.

**Gaps deferred:** graph core (`find_related`, `query_wiki`) → Plan 2b; SKILL, CLI, hooks, E2E → WF3–WF7.

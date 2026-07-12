import type { Config } from "../lib/config.js";
import { loadConfig } from "../lib/config.js";
import { EtapiError } from "../lib/errors.js";
import type {
  AppInfo,
  Attribute,
  Branch,
  CreateAttributeInput,
  CreateBranchInput,
  CreateNoteInput,
  CreateNoteResult,
  EtapiErrorPayload,
  Note,
  SearchNotesParams,
  SubtreeNode,
  UpdateNoteInput,
} from "./types.js";

const RETRY_DELAY_MS = 250;

export class EtapiClient {
  protected readonly cfg: Config;
  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  protected async request<T>(
    method: string,
    path: string,
    opts: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      retry?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.cfg.url}/etapi${path}`);
    // NOTE: empty string is allowed (search="" is a valid/required ETAPI param).
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const idempotent = method === "GET" || method === "DELETE" || method === "PUT";

    const doOnce = async (): Promise<Response> => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
      try {
        return await fetch(url, {
          method,
          headers: {
            Authorization: this.cfg.token,
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let resp: Response;
    try {
      resp = await doOnce();
    } catch (e) {
      if (opts.retry !== false && idempotent) {
        await sleep(RETRY_DELAY_MS);
        resp = await doOnce();
      } else {
        throw e;
      }
    }
    if (resp.status === 503 && opts.retry !== false && idempotent) {
      await sleep(RETRY_DELAY_MS);
      resp = await doOnce();
    }
    if (resp.status === 204) return undefined as T;

    if (!resp.ok) {
      let payload: EtapiErrorPayload;
      try {
        payload = (await resp.json()) as EtapiErrorPayload;
      } catch {
        payload = { status: resp.status, code: "GENERIC", message: resp.statusText };
      }
      throw new EtapiError(payload);
    }
    if (resp.status === 200 || resp.status === 201) {
      return (await resp.json()) as T;
    }
    return undefined as T;
  }

  // Text variant for /content endpoints (raw body, not JSON).
  protected async requestText(method: string, path: string, opts: { body?: string } = {}): Promise<string> {
    const url = new URL(`${this.cfg.url}/etapi${path}`);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers: {
          Authorization: this.cfg.token,
          "Content-Type": "text/plain",
        },
        body: opts.body,
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
      return await resp.text();
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- direct endpoints ----
  getAppInfo(): Promise<AppInfo> {
    return this.request<AppInfo>("GET", "/app-info");
  }
  getNote(noteId: string): Promise<Note> {
    return this.request<Note>("GET", `/notes/${encodeURIComponent(noteId)}`);
  }
  getNoteContent(noteId: string): Promise<string> {
    return this.requestText("GET", `/notes/${encodeURIComponent(noteId)}/content`);
  }
  createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
    return this.request<CreateNoteResult>("POST", "/create-note", { body: input });
  }
  updateNote(noteId: string, patch: UpdateNoteInput): Promise<Note> {
    return this.request<Note>("PATCH", `/notes/${encodeURIComponent(noteId)}`, { body: patch });
  }
  updateNoteContent(noteId: string, content: string): Promise<void> {
    return this.requestText("PUT", `/notes/${encodeURIComponent(noteId)}/content`, { body: content }).then(
      () => undefined,
    );
  }
  deleteNote(noteId: string): Promise<void> {
    return this.request<void>("DELETE", `/notes/${encodeURIComponent(noteId)}`);
  }
  searchNotes(params: SearchNotesParams): Promise<Note[]> {
    return this.request<{ results: Note[] }>("GET", "/notes", {
      query: {
        search: params.search,
        fastSearch: params.fastSearch,
        includeArchivedNotes: params.includeArchivedNotes,
        ancestorNoteId: params.ancestorNoteId,
        ancestorDepth: params.ancestorDepth,
        orderBy: params.orderBy,
        orderDirection: params.orderDirection,
        limit: params.limit,
        debug: params.debug,
      },
    }).then((r) => r.results);
  }
  getAttribute(attributeId: string): Promise<Attribute> {
    return this.request<Attribute>("GET", `/attributes/${encodeURIComponent(attributeId)}`);
  }
  createAttribute(input: CreateAttributeInput): Promise<Attribute> {
    return this.request<Attribute>("POST", "/attributes", { body: input });
  }
  updateAttribute(attributeId: string, patch: { value?: string; position?: number }): Promise<Attribute> {
    return this.request<Attribute>("PATCH", `/attributes/${encodeURIComponent(attributeId)}`, { body: patch });
  }
  deleteAttribute(attributeId: string): Promise<void> {
    return this.request<void>("DELETE", `/attributes/${encodeURIComponent(attributeId)}`);
  }
  getBranch(branchId: string): Promise<Branch> {
    return this.request<Branch>("GET", `/branches/${encodeURIComponent(branchId)}`);
  }
  createBranch(input: CreateBranchInput): Promise<Branch> {
    return this.request<Branch>("POST", "/branches", { body: input });
  }
  updateBranch(
    branchId: string,
    patch: Partial<Pick<Branch, "notePosition" | "prefix" | "isExpanded">>,
  ): Promise<Branch> {
    return this.request<Branch>("PATCH", `/branches/${encodeURIComponent(branchId)}`, { body: patch });
  }
  deleteBranch(branchId: string): Promise<void> {
    return this.request<void>("DELETE", `/branches/${encodeURIComponent(branchId)}`);
  }
  refreshNoteOrdering(parentNoteId: string): Promise<void> {
    return this.request<void>("POST", `/refresh-note-ordering/${encodeURIComponent(parentNoteId)}`);
  }
  getDayNote(date: string): Promise<Note> {
    return this.request<Note>("GET", `/calendar/days/${encodeURIComponent(date)}`);
  }
  getWeekNote(week: string): Promise<Note> {
    return this.request<Note>("GET", `/calendar/weeks/${encodeURIComponent(week)}`);
  }
  getInboxNote(date: string): Promise<Note> {
    return this.request<Note>("GET", `/inbox/${encodeURIComponent(date)}`);
  }

  // ---- composite methods (ETAPI has no direct endpoint) ----
  getNoteTree(noteId: string, opts: { limit?: number } = {}): Promise<Note[]> {
    return this.searchNotes({
      search: "",
      ancestorNoteId: noteId,
      ancestorDepth: "eq1",
      limit: opts.limit ?? 50,
    });
  }

  async getNoteSubtree(
    noteId: string,
    opts: { maxNodes?: number; maxPerNode?: number } = {},
  ): Promise<SubtreeNode> {
    const maxNodes = opts.maxNodes ?? 100;
    const maxPerNode = opts.maxPerNode ?? 20;
    const root = await this.getNote(noteId);
    const rootNode: SubtreeNode = { note: root, children: [] };
    const queue: SubtreeNode[] = [rootNode];
    let visited = 1;
    while (queue.length && visited < maxNodes) {
      const node = queue.shift()!;
      const childIds = node.note.childNoteIds.slice(0, maxPerNode);
      const children = await Promise.all(childIds.map((id) => this.getNote(id)));
      for (const note of children) {
        if (visited >= maxNodes) break;
        const childNode: SubtreeNode = { note, children: [] };
        node.children.push(childNode);
        queue.push(childNode);
        visited++;
      }
    }
    return rootNode;
  }

  async getNotePath(noteId: string): Promise<Note[]> {
    const path: Note[] = [];
    let current = await this.getNote(noteId);
    while (current.parentNoteIds.length > 0 && current.parentNoteIds[0] !== "none") {
      const parentId = current.parentNoteIds[0]!;
      if (parentId === "root") {
        path.push(await this.getNote("root"));
        break;
      }
      current = await this.getNote(parentId);
      path.push(current);
    }
    return path;
  }

  async appendToNote(noteId: string, fragment: string): Promise<void> {
    const current = await this.getNoteContent(noteId);
    await this.updateNoteContent(noteId, current + fragment);
  }

  async getNoteAttributes(noteId: string): Promise<Attribute[]> {
    const note = await this.getNote(noteId);
    return note.attributes;
  }

  async upsertAttribute(input: CreateAttributeInput): Promise<Attribute> {
    const note = await this.getNote(input.noteId);
    const existing = note.attributes.find((a) => a.type === input.type && a.name === input.name);
    if (existing) {
      // Labels: value/position patchable; relations: position only.
      // If isInheritable differs, fall back to delete+create.
      const sameInheritable =
        input.isInheritable === undefined || input.isInheritable === existing.isInheritable;
      if (sameInheritable) {
        if (input.type === "label" && input.value !== undefined) {
          return this.updateAttribute(existing.attributeId, { value: input.value });
        }
        if (input.position !== undefined) {
          return this.updateAttribute(existing.attributeId, { position: input.position });
        }
      }
      await this.deleteAttribute(existing.attributeId);
    }
    return this.createAttribute(input);
  }

  async moveNote(
    noteId: string,
    toParentNoteId: string,
    opts: { notePosition?: number; prefix?: string } = {},
  ): Promise<Branch> {
    const note = await this.getNote(noteId);
    const oldBranchId = note.parentBranchIds[0];
    if (oldBranchId) await this.deleteBranch(oldBranchId);
    const branch = await this.createBranch({
      noteId,
      parentNoteId: toParentNoteId,
      notePosition: opts.notePosition,
      prefix: opts.prefix,
    });
    await this.refreshNoteOrdering(toParentNoteId);
    return branch;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createClientFromEnv(): EtapiClient {
  return new EtapiClient(loadConfig());
}

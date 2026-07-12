import type { EtapiClient } from "../etapi/client.js";
import type { Note } from "../etapi/types.js";
import { VAULT_ROOT_TITLE, VAULT_STRUCTURE } from "./conventions.js";
import type { LogEntry, StructureNode } from "./conventions.js";
import { formatLogEntry } from "./format.js";

export async function findChildByTitle(
  client: EtapiClient,
  parentId: string,
  title: string,
): Promise<Note | null> {
  const hits = await client.searchNotes({
    search: title,
    ancestorNoteId: parentId,
    ancestorDepth: "eq1",
    limit: 50,
  });
  return hits.find((n) => n.title === title) ?? null;
}

export function findVaultRoot(client: EtapiClient): Promise<Note | null> {
  return findChildByTitle(client, "root", VAULT_ROOT_TITLE);
}

export async function ensureLabel(
  client: EtapiClient,
  noteId: string,
  name: string,
  value: string,
  inheritable: boolean,
): Promise<void> {
  const attrs = await client.getNoteAttributes(noteId);
  const existing = attrs.find((a) => a.type === "label" && a.name === name);
  if (existing) return; // idempotent: do not overwrite
  await client.createAttribute({ noteId, type: "label", name, value, isInheritable: inheritable });
}

export async function findOrCreateChild(
  client: EtapiClient,
  parentId: string,
  node: StructureNode,
): Promise<{ note: Note; created: boolean }> {
  const existing = await findChildByTitle(client, parentId, node.title);
  if (existing) return { note: existing, created: false };
  const r = await client.createNote({
    parentNoteId: parentId,
    title: node.title,
    type: node.type === "book" ? "book" : "text",
    content: node.template ?? "",
  });
  await ensureLabel(client, r.note.noteId, "wikiLayer", node.layer, node.inheritable);
  return { note: r.note, created: true };
}

export async function seedVault(client: EtapiClient): Promise<{
  rootId: string;
  created: { title: string }[];
  skipped: { title: string }[];
}> {
  const created: { title: string }[] = [];
  const skipped: { title: string }[] = [];

  async function realize(parentId: string, node: StructureNode): Promise<Note> {
    const { note, created: c } = await findOrCreateChild(client, parentId, node);
    (c ? created : skipped).push({ title: node.title });
    for (const child of node.children ?? []) await realize(note.noteId, child);
    return note;
  }

  const root = await realize("root", VAULT_STRUCTURE);
  return { rootId: root.noteId, created, skipped };
}

export function getIndexNote(client: EtapiClient, rootId: string): Promise<Note | null> {
  return findChildByTitle(client, rootId, "Index");
}

export function getLogNote(client: EtapiClient, rootId: string): Promise<Note | null> {
  return findChildByTitle(client, rootId, "Log");
}

export async function appendLogEntry(client: EtapiClient, entry: LogEntry): Promise<void> {
  const root = await findVaultRoot(client);
  if (!root) throw new Error("LLM Wiki vault not found; cannot append log entry");
  const log = await getLogNote(client, root.noteId);
  if (!log) throw new Error("Log note not found in vault");
  await client.appendToNote(log.noteId, `\n${formatLogEntry(entry)}`);
}

import { createClientFromEnv } from "../../src/etapi/client.js";
import { loadConfig } from "../../src/lib/config.js";
import type { EtapiClient } from "../../src/etapi/client.js";
import type { Note } from "../../src/etapi/types.js";

export const TEST_ROOT_TITLE = "__mcp_test_root__";

export function integrationEnabled(): boolean {
  try {
    loadConfig();
    return true;
  } catch {
    return false;
  }
}

export function liveClient(): EtapiClient {
  return createClientFromEnv();
}

/**
 * Trilium indexes attributes asynchronously into its in-memory cache (becca),
 * so a `#label=value` search right after upsertAttribute can miss. Poll until
 * the predicate holds or timeout.
 */
export async function waitForSearch(
  client: EtapiClient,
  search: string,
  predicate: (notes: Note[]) => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const notes = await client.searchNotes({ search });
    if (predicate(notes)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`search did not converge within ${timeoutMs}ms: ${search}`);
}

export async function ensureTestRoot(client: EtapiClient): Promise<string> {
  const hits = await client.searchNotes({ search: TEST_ROOT_TITLE });
  const existing = hits.find((n) => n.title === TEST_ROOT_TITLE);
  if (existing) return existing.noteId;
  const r = await client.createNote({
    parentNoteId: "root",
    title: TEST_ROOT_TITLE,
    type: "text",
    content: "",
  });
  return r.note.noteId;
}

export async function cleanupTestRoot(client: EtapiClient, noteId: string): Promise<void> {
  await client.deleteNote(noteId);
}

import { createClientFromEnv } from "../../src/etapi/client.js";
import { loadConfig } from "../../src/lib/config.js";
import type { EtapiClient } from "../../src/etapi/client.js";

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

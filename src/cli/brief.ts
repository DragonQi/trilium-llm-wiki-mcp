import type { EtapiClient } from "../etapi/client.js";
import { findVaultRoot, getIndexNote, getLogNote } from "./vault.js";
import { parseLogEntries } from "./format.js";
import { stripHtml } from "../lib/html.js";
import type { CommandResult, LogEntry } from "./conventions.js";

export async function cmdBrief(client: EtapiClient): Promise<CommandResult> {
  const root = await findVaultRoot(client);
  if (!root) {
    return { ok: false, stdout: "", stderr: "LLM Wiki vault not found. Run `trilium-wiki init` first." };
  }
  const [indexNote, logNote] = await Promise.all([
    getIndexNote(client, root.noteId),
    getLogNote(client, root.noteId),
  ]);

  let indexText = "";
  if (indexNote) {
    try {
      indexText = stripHtml(await client.getNoteContent(indexNote.noteId)).slice(0, 2000);
    } catch {
      /* ignore */
    }
  }

  let recent: LogEntry[] = [];
  if (logNote) {
    try {
      recent = parseLogEntries(await client.getNoteContent(logNote.noteId)).slice(-5);
    } catch {
      /* ignore */
    }
  }

  const weak = await client.searchNotes({ search: "#status=weak", limit: 100 });
  const orphans = await client.searchNotes({ search: "#orphanCandidate=true", limit: 100 });
  const openQueries = await client.searchNotes({
    search: "#wikiLayer=query #reviewResolved!=true",
    limit: 50,
  });

  const lines = [
    "# LLM Wiki brief",
    "",
    "## Index (excerpt)",
    indexText || "(empty)",
    "",
    "## Recent activity",
    ...recent.map((e) => `- [${e.date}] ${e.op} — ${e.title}`),
    "",
    "## Flags",
    `- weak-confidence pages: ${weak.length}`,
    `- orphan candidates: ${orphans.length}`,
    `- open queries: ${openQueries.length}`,
  ];
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}

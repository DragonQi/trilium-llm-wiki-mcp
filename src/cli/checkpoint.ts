import type { EtapiClient } from "../etapi/client.js";
import { appendLogEntry, findVaultRoot } from "./vault.js";
import { today } from "./format.js";
import type { CommandResult } from "./conventions.js";

export async function cmdCheckpoint(client: EtapiClient): Promise<CommandResult> {
  const root = await findVaultRoot(client);
  if (!root) return { ok: false, stdout: "", stderr: "LLM Wiki vault not found; nothing to checkpoint." };
  const weak = await client.searchNotes({ search: "#status=weak", limit: 100 });
  const orphans = await client.searchNotes({ search: "#orphanCandidate=true", limit: 100 });
  await appendLogEntry(client, {
    date: today(),
    op: "session",
    title: `end (weak=${weak.length}, orphan=${orphans.length})`,
  });
  return {
    ok: true,
    stdout: `Checkpoint written. weak=${weak.length} orphan=${orphans.length}`,
    stderr:
      weak.length + orphans.length > 0 ? "Reminder: review weak/orphan pages via the wiki skill." : "",
  };
}

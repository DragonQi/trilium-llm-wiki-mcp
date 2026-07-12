import type { EtapiClient } from "../etapi/client.js";
import { seedVault } from "./vault.js";
import type { CommandResult } from "./conventions.js";

export async function cmdInit(client: EtapiClient): Promise<CommandResult> {
  const { rootId, created, skipped } = await seedVault(client);
  const lines = [
    `Vault root: ${rootId}`,
    `Created: ${created.length ? created.map((c) => c.title).join(", ") : "(none — already seeded)"}`,
    `Skipped (existing): ${skipped.length}`,
  ];
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}

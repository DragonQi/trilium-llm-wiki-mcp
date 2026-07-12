import type { EtapiClient } from "../etapi/client.js";
import { findVaultRoot } from "./vault.js";
import type { CommandResult } from "./conventions.js";

export async function cmdDoctor(client: EtapiClient): Promise<CommandResult> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // 1. Trilium reachable + token valid
  try {
    const info = await client.getAppInfo();
    checks.push({
      name: "Trilium",
      ok: true,
      detail: `v${info.appVersion} @ ${process.env.TRILIUM_URL ?? "?"}`,
    });
  } catch (e) {
    checks.push({ name: "Trilium", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // 2. Vault initialized
  let vaultOk = false;
  try {
    const root = await findVaultRoot(client);
    vaultOk = !!root;
    checks.push({ name: "Vault", ok: vaultOk, detail: vaultOk ? "LLM Wiki found" : "not found" });
  } catch (e) {
    checks.push({ name: "Vault", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  const allOk = checks.every((c) => c.ok);
  const lines = checks.map((c) => `[${c.ok ? "OK" : "FAIL"}] ${c.name}: ${c.detail}`);
  if (!vaultOk) lines.push("Run `trilium-wiki init` to seed the LLM Wiki vault.");
  return { ok: allOk, stdout: lines.join("\n"), stderr: "" };
}

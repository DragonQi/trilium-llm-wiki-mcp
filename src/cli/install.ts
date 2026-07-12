import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { CommandResult } from "./conventions.js";

interface HookEntry {
  matcher?: string;
  hooks: { type: "command"; command: string }[];
}
interface SettingsJson {
  hooks?: Record<string, HookEntry[]>;
  mcpServers?: Record<string, unknown>;
}

const HOOK_CMD = "npx -y -p trilium-llm-wiki-mcp trilium-wiki";

function mergeHookList(
  existing: HookEntry[] | undefined,
  matcher: string,
  command: string,
): HookEntry[] {
  const list: HookEntry[] = existing ? structuredClone(existing) : [];
  let bucket = list.find((h) => (h.matcher ?? "") === matcher);
  if (!bucket) {
    bucket = { matcher, hooks: [] };
    list.push(bucket);
  }
  if (!bucket.hooks.some((h) => h.command === command)) {
    bucket.hooks.push({ type: "command", command });
  }
  return list;
}

export async function cmdInstall(opts: {
  claudeDir?: string;
  dryRun?: boolean;
} = {}): Promise<CommandResult> {
  const claudeDir = opts.claudeDir ?? join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  let settings: SettingsJson = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }
  settings.hooks = {
    SessionStart: mergeHookList(settings.hooks?.SessionStart, "", `${HOOK_CMD} brief`),
    Stop: mergeHookList(settings.hooks?.Stop, "", `${HOOK_CMD} checkpoint`),
  };

  const lines: string[] = [];
  if (opts.dryRun) {
    lines.push("[dry-run] Would merge hooks into " + settingsPath);
    lines.push(JSON.stringify({ hooks: settings.hooks }, null, 2));
  } else {
    mkdirSync(claudeDir, { recursive: true });
    const tmp = settingsPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(settings, null, 2));
    renameSync(tmp, settingsPath); // atomic
    lines.push("Hooks installed into " + settingsPath);
  }

  lines.push("");
  lines.push("Next steps:");
  lines.push("  1) Register the MCP server (project or user scope):");
  lines.push(
    "     claude mcp add --scope user trilium --env TRILIUM_URL=$TRILIUM_URL --env TRILIUM_TOKEN=$TRILIUM_TOKEN -- npx -y trilium-llm-wiki-mcp",
  );
  lines.push("  2) Seed the vault:   npx -y trilium-llm-wiki-mcp trilium-wiki init");
  lines.push("  3) Verify:           npx -y trilium-llm-wiki-mcp trilium-wiki doctor");
  const skillSrc = resolve("skill");
  if (existsSync(skillSrc)) {
    lines.push("  4) Skill detected at ./skill — copy to " + join(claudeDir, "skills", "trilium-wiki"));
  } else {
    lines.push("  4) Skill (./skill) not found yet — it arrives in the WF4 phase; re-run install after.");
  }
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}

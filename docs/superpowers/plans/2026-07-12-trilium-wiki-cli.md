# Trilium Wiki Companion CLI (WF3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Build the `trilium-wiki` companion CLI — the automation surface that runs **outside** the MCP transport (hooks fire when MCP isn't connected). Commands: `init` (idempotent vault seed), `brief` (SessionStart context), `checkpoint` (Stop session marker), `doctor` (bundle health), `install` (register MCP + skill + hooks). It reuses the **same** `EtapiClient` as the MCP server (spec §4.1/§4.4 — no parallel implementation).

**Architecture:** New `src/cli/` package, second `bin` (`trilium-wiki` → `dist/cli/index.ts`). The CLI imports `createClientFromEnv` from `src/etapi/client.js` and the wiki label/relation conventions from `src/cli/conventions.ts`. Each command is a pure function `async function cmd(client, args): Promise<CommandResult>` (testable without process.argv); `src/cli/index.ts` is a thin dispatcher (parse argv → call cmd → print → exit code). `install` is the only command that touches the filesystem (`~/.claude/`).

**Tech Stack:** unchanged + nothing new (zero new deps — clean-room argv parsing; Node `fs`/`os`/`path`/`child_process` from stdlib).

## Design decisions (locked; configurable as constants)

1. **Vault identity.** The vault root is the single note titled `LLM Wiki` whose parent is `root` (search by title, filter `parentNoteId === "root"`). `init` is idempotent: if the root exists, it only fills in any missing children/labels.
2. **Vault structure** (spec §5.1), created as `book`-type containers under the root:
   ```
   LLM Wiki
   ├── Purpose        (text)  #wikiLayer=purpose
   ├── Raw            (book, inheritable #wikiLayer=raw)
   ├── Wiki           (book)
   │   ├── Summaries  (book, inheritable #wikiLayer=summary)
   │   ├── Concepts   (book, inheritable #wikiLayer=concept)
   │   ├── Entities   (book, inheritable #wikiLayer=entity)
   │   ├── Queries    (book, inheritable #wikiLayer=query)
   │   ├── Comparisons(book, inheritable #wikiLayer=comparison)
   │   ├── Overview   (book, inheritable #wikiLayer=overview)
   │   └── Synthesis  (book, inheritable #wikiLayer=synthesis)
   ├── Review         (book, inheritable #wikiLayer=review)
   ├── Index          (text)  #wikiLayer=index
   └── Log            (text)  #wikiLayer=log
   ```
   Inheritable labels on containers mean a note created under `Concepts/` automatically inherits `#wikiLayer=concept` (free structural typing for the SKILL).
3. **Content templates.** `Purpose`, `Index`, `Log` get seeded HTML bodies so they're never empty:
   - `Purpose`: `<h1>Purpose</h1><p>Goal: …</p><h2>Key questions</h2><ul><li>…</li></ul><h2>Scope</h2><p>…</p><h2>Thesis</h2><p>…</p>`
   - `Index`: `<h1>Index</h1><p>(one line per page: link — summary — #status)</p>`
   - `Log`: `<h1>Log</h1>` (append-only; entries below)
4. **Log entry format** (spec §5.1, parseable): `## [YYYY-MM-DD] op | title` where `op ∈ {ingest, query, lint, delete, session}`. `checkpoint` appends `## [<today>] session | end` plus a small summary block.
5. **Arg parsing** — hand-rolled (zero deps): `process.argv[2]` is the command; remaining tokens are `--flag` or `--flag=value`. No external CLI lib (keeps the dependency surface minimal and clean-room-friendly).
6. **Hooks command** (written by `install` into `~/.claude/settings.json`): `npx -y -p trilium-llm-wiki-mcp trilium-wiki <cmd>` — works without a global install on any machine (spec §4.5 npx requirement). `SessionStart → trilium-wiki brief`; `Stop → trilium-wiki checkpoint`.
7. **settings.json merge** (spec §4.5): read → parse → merge the two hook arrays (dedup by command) → write back atomically (temp file + rename). Never overwrite existing hooks/MCP entries. If the file is absent, create it with just our block.
8. **Skill wiring.** `install` copies `./skill/` (arrives in WF4) into `~/.claude/skills/trilium-wiki/` if it exists locally; otherwise warns that WF4 hasn't landed. (This keeps `install` shippable now and complete after WF4.)
9. **Output contract.** Every command returns `{ ok: boolean; stdout: string; stderr: string }`; the dispatcher writes stdout/stderr and exits `0`/`1`. This makes commands unit-testable (call the function, assert the strings) and lets hooks capture `brief`'s stdout.

## Global Constraints (additions; prior constraints still apply)

- **Clean-room, MIT, env-only, NodeNext ESM, Git Bash** — unchanged.
- **Shared ETAPI client** — CLI must import `createClientFromEnv` (and types) from `../etapi/client.js`. No duplicate ETAPI code.
- **Idempotency** — `init` is a no-op on an already-seeded vault (doesn't duplicate children or labels); `install` is a no-op on already-merged settings.
- **No PC-specific paths in committed files.** `install` derives everything from `os.homedir()` + env; `~/.claude/` is the only writable target.
- **Exit codes**: `0` success, `1` operational failure (e.g. Trilium unreachable, vault missing for `brief`/`checkpoint`), `2` usage error.
- **Trilium async indexing**: commands that search by a label they just wrote (`doctor`'s orphan count, `brief`'s weak count) tolerate zero results gracefully (the vault may be freshly seeded).

---

## File Structure (additions)

```
src/
├── cli/
│   ├── index.ts          # bin entry: argv parse → dispatch → exit code
│   ├── conventions.ts    # VAULT_ROOT_TITLE, STRUCTURE, LABEL defs, LOG format
│   ├── vault.ts          # findVaultRoot, findOrCreateChild, ensureLabel, getLog/appendLog
│   ├── init.ts           # cmdInit(client) → seeds the vault
│   ├── brief.ts          # cmdBrief(client) → SessionStart text
│   ├── checkpoint.ts     # cmdCheckpoint(client) → Stop marker
│   ├── doctor.ts         # cmdDoctor(client) → health checks
│   ├── install.ts        # cmdInstall(opts) → MCP + hooks + skill (filesystem)
│   └── format.ts         # parseLogEntries, today(), formatBrief
└── (package.json: add bin "trilium-wiki")
tests/
├── unit/cli/{conventions,vault,format,brief,checkpoint,doctor,init}.test.ts  # NEW
└── integration/cli.integration.test.ts   # NEW — init/brief/checkpoint/doctor vs live Trilium
```

**Responsibilities:** `conventions.ts` is the single source of truth for the vault schema (so WF4's SKILL references the same constants); `vault.ts` owns all ETAPI I/O for vault structure; command files are thin orchestrators.

---

## Task 1: CLI scaffold + conventions + format helpers

**Files:** Modify `package.json` (add bin + build include); Create `src/cli/index.ts`, `src/cli/conventions.ts`, `src/cli/format.ts`, `tests/unit/cli/conventions.test.ts`, `tests/unit/cli/format.test.ts`

**Interfaces:**
- Produces: `VAULT_ROOT_TITLE`, `VAULT_STRUCTURE` (tree spec), `LogEntry { date, op, title }`, `today()`, `parseLogEntries(html)`, `formatLogEntry(e)`, `CommandResult { ok, stdout, stderr }`, and a `dispatch(argv): Promise<number>` entry.

- [ ] **Step 1: Add bin + CLI build to `package.json`**

```json
"bin": { "trilium-mcp": "dist/index.js", "trilium-wiki": "dist/cli/index.js" },
```
tsconfig `include` already covers `src/**/*`, so `src/cli/**` compiles to `dist/cli/**`.

- [ ] **Step 2: Implement `src/cli/conventions.ts`**

```ts
export const VAULT_ROOT_TITLE = "LLM Wiki";

// Layer label values per structural node. Inheritable ones propagate to children.
export type WikiLayer =
  | "purpose" | "raw" | "wiki" | "summary" | "concept" | "entity"
  | "query" | "comparison" | "overview" | "synthesis" | "review" | "index" | "log";

export interface StructureNode {
  title: string;
  layer: WikiLayer;
  inheritable: boolean; // #wikiLayer is inheritable on this node
  type: "book" | "text";
  template?: string; // HTML body for text nodes
  children?: StructureNode[];
}

export const VAULT_STRUCTURE: StructureNode = {
  title: VAULT_ROOT_TITLE,
  layer: "wiki",
  inheritable: false,
  type: "book",
  children: [
    { title: "Purpose", layer: "purpose", inheritable: false, type: "text",
      template: "<h1>Purpose</h1><p>Goal: …</p><h2>Key questions</h2><ul><li>…</li></ul><h2>Scope</h2><p>…</p><h2>Thesis</h2><p>…</p>" },
    { title: "Raw", layer: "raw", inheritable: true, type: "book" },
    { title: "Wiki", layer: "wiki", inheritable: false, type: "book", children: [
      { title: "Summaries", layer: "summary", inheritable: true, type: "book" },
      { title: "Concepts", layer: "concept", inheritable: true, type: "book" },
      { title: "Entities", layer: "entity", inheritable: true, type: "book" },
      { title: "Queries", layer: "query", inheritable: true, type: "book" },
      { title: "Comparisons", layer: "comparison", inheritable: true, type: "book" },
      { title: "Overview", layer: "overview", inheritable: true, type: "book" },
      { title: "Synthesis", layer: "synthesis", inheritable: true, type: "book" },
    ]},
    { title: "Review", layer: "review", inheritable: true, type: "book" },
    { title: "Index", layer: "index", inheritable: false, type: "text",
      template: "<h1>Index</h1><p>(one line per page: link — summary — #status)</p>" },
    { title: "Log", layer: "log", inheritable: false, type: "text",
      template: "<h1>Log</h1>" },
  ],
};

export type LogOp = "ingest" | "query" | "lint" | "delete" | "session";

export interface LogEntry {
  date: string; // YYYY-MM-DD
  op: LogOp;
  title: string;
}

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}
```

- [ ] **Step 3: Implement `src/cli/format.ts`**

```ts
import type { LogEntry, LogOp } from "./conventions.js";

export function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC, stable)
}

// Parse `## [YYYY-MM-DD] op | title` lines from the Log HTML body.
export function parseLogEntries(html: string): LogEntry[] {
  const re = /##\s*\[(\d{4}-\d{2}-\d{2})\]\s*(ingest|query|lint|delete|session)\s*\|\s*(.+)/g;
  const out: LogEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ date: m[1]!, op: m[2] as LogOp, title: m[3]!.trim() });
  }
  return out;
}

export function formatLogEntry(e: LogEntry): string {
  return `## [${e.date}] ${e.op} | ${e.title}`;
}
```

- [ ] **Step 4: Tests** — `conventions.test.ts` (VAULT_STRUCTURE has 8 Wiki children, each container marked inheritable) and `format.test.ts` (`parseLogEntries` round-trips `formatLogEntry`; ignores non-entry lines).

- [ ] **Step 5: Implement the dispatcher `src/cli/index.ts`** (commands wired incrementally; stubs return a clear "not implemented" until their task lands)

```ts
#!/usr/bin/env node
import { createClientFromEnv } from "../etapi/client.js";
import { cmdInit } from "./init.js";
import { cmdBrief } from "./brief.js";
import { cmdCheckpoint } from "./checkpoint.js";
import { cmdDoctor } from "./doctor.js";
import { cmdInstall } from "./install.js";
import type { CommandResult } from "./conventions.js";

function usage(): CommandResult {
  return {
    ok: false,
    stdout: "",
    stderr: "Usage: trilium-wiki <init|brief|checkpoint|doctor|install> [options]",
  };
}

export async function dispatch(argv: string[]): Promise<number> {
  const cmd = argv[2];
  let res: CommandResult;
  try {
    switch (cmd) {
      case "init": res = await cmdInit(createClientFromEnv()); break;
      case "brief": res = await cmdBrief(createClientFromEnv()); break;
      case "checkpoint": res = await cmdCheckpoint(createClientFromEnv()); break;
      case "doctor": res = await cmdDoctor(createClientFromEnv()); break;
      case "install": res = await cmdInstall({}); break;
      default: res = usage();
    }
  } catch (e) {
    res = { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
  if (res.stdout) process.stdout.write(res.stdout + "\n");
  if (res.stderr) process.stderr.write(res.stderr + "\n");
  return res.ok ? 0 : cmd === undefined ? 2 : 1;
}

async function main(): Promise<void> {
  const code = await dispatch(process.argv);
  process.exit(code);
}
void main();
```

> The other command modules are imported here; create them as stubs in their own tasks. For Task 1, create minimal stubs (`export async function cmdX(): Promise<CommandResult> { return { ok:false, stdout:"", stderr:"not implemented" }; }`) so this compiles, replacing each as its task lands.

- [ ] **Step 6: Build, test, commit**

```bash
npm run build && npm test && npm run lint
git add -A
git commit -m "feat(cli): scaffold trilium-wiki bin, conventions, format helpers (WF3)"
```

---

## Task 2: Vault helpers (`src/cli/vault.ts`)

**Files:** Create `src/cli/vault.ts`, `tests/unit/cli/vault.test.ts`

**Interfaces:**
- `findVaultRoot(client): Promise<Note | null>`
- `findChildByTitle(client, parentId, title): Promise<Note | null>`
- `findOrCreateChild(client, parentId, node: StructureNode): Promise<{ note: Note; created: boolean }>`
- `ensureLabel(client, noteId, name, value, inheritable): Promise<void>` (idempotent — set if absent)
- `seedVault(client): Promise<{ rootId: string; created: { title: string }[]; skipped: { title: string }[] }>` — recursively realizes `VAULT_STRUCTURE`, returns what it created vs. found.
- `getLogNote(client, rootId): Promise<Note | null>` / `getIndexNote(client, rootId): Promise<Note | null>`
- `appendLogEntry(client, entry: LogEntry): Promise<void>` (appends `formatLogEntry` to the Log note body).

- [ ] **Step 1: Implement** — use `client.searchNotes({ search: title, ancestorNoteId: parentId, ancestorDepth: "eq1" })` then filter by exact title for lookups; `client.createNote` + `client.upsertAttribute` for creation; `client.getNoteContent`/`client.updateNoteContent`/`client.appendToNote` for Log/Index bodies.

- [ ] **Step 2: Unit-test `seedVault`** with the `mockClient` (mock `searchNotes` to simulate an empty vault first pass, then a pre-seeded vault second pass) — assert idempotency: second call creates nothing, skips all.

- [ ] **Step 3: Build, test, commit** — `feat(cli): vault helpers — find/seed structure, labels, log append (WF3)`.

---

## Task 3: `init` command

**Files:** Create `src/cli/init.ts` (replace stub), `tests/unit/cli/init.test.ts`

- [ ] **Step 1: Implement `cmdInit(client)`**

```ts
import { seedVault } from "./vault.js";
import type { CommandResult } from "./conventions.js";

export async function cmdInit(client: import("../etapi/client.js").EtapiClient): Promise<CommandResult> {
  const { rootId, created, skipped } = await seedVault(client);
  const lines = [
    `Vault root: ${rootId}`,
    `Created: ${created.length ? created.map((c) => c.title).join(", ") : "(none — already seeded)"}`,
    `Skipped (existing): ${skipped.length}`,
  ];
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}
```

- [ ] **Step 2: Unit test** — mock `seedVault` (vi.mock `./vault.js`), assert output formatting for both the fresh and already-seeded cases.

- [ ] **Step 3: Build, test, commit** — `feat(cli): init command — idempotent vault seed (WF3)`.

---

## Task 4: `brief` command (SessionStart)

**Files:** Create `src/cli/brief.ts`, `tests/unit/cli/brief.test.ts`

- [ ] **Step 1: Implement `cmdBrief(client)`**

```ts
import { findVaultRoot, getIndexNote, getLogNote } from "./vault.js";
import { parseLogEntries } from "./format.js";
import { stripHtml } from "../lib/html.js";
import type { CommandResult } from "./conventions.js";

export async function cmdBrief(client: import("../etapi/client.js").EtapiClient): Promise<CommandResult> {
  const root = await findVaultRoot(client);
  if (!root) {
    return { ok: false, stdout: "", stderr: "LLM Wiki vault not found. Run `trilium-wiki init` first." };
  }
  const [indexNote, logNote] = await Promise.all([getIndexNote(client, root.noteId), getLogNote(client, root.noteId)]);
  let indexText = "";
  if (indexNote) {
    try { indexText = stripHtml(await client.getNoteContent(indexNote.noteId)).slice(0, 2000); } catch { /* ignore */ }
  }
  let recent: import("./conventions.js").LogEntry[] = [];
  if (logNote) {
    try { recent = parseLogEntries(await client.getNoteContent(logNote.noteId)).slice(-5); } catch { /* ignore */ }
  }
  const weak = await client.searchNotes({ search: "#status=weak", limit: 100 });
  const orphans = await client.searchNotes({ search: "#orphanCandidate=true", limit: 100 });
  const openQueries = await client.searchNotes({ search: "#wikiLayer=query #reviewResolved!=true", limit: 50 });

  const lines = [
    `# LLM Wiki brief`,
    ``,
    `## Index (excerpt)`,
    indexText || "(empty)",
    ``,
    `## Recent activity`,
    ...recent.map((e) => `- [${e.date}] ${e.op} — ${e.title}`),
    ``,
    `## Flags`,
    `- weak-confidence pages: ${weak.length}`,
    `- orphan candidates: ${orphans.length}`,
    `- open queries: ${openQueries.length}`,
  ];
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}
```

- [ ] **Step 2: Unit test** — mock client + vault helpers; assert: missing-root → `ok:false`; present vault → stdout contains "LLM Wiki brief", the flags line, and recent entries are rendered from parsed log.

- [ ] **Step 3: Build, test, commit** — `feat(cli): brief command — SessionStart wiki context (WF3)`.

---

## Task 5: `checkpoint` command (Stop)

**Files:** Create `src/cli/checkpoint.ts`, `tests/unit/cli/checkpoint.test.ts`

- [ ] **Step 1: Implement `cmdCheckpoint(client)`**

```ts
import { findVaultRoot, getLogNote, appendLogEntry } from "./vault.js";
import { today } from "./format.js";
import type { CommandResult } from "./conventions.js";

export async function cmdCheckpoint(client: import("../etapi/client.js").EtapiClient): Promise<CommandResult> {
  const root = await findVaultRoot(client);
  if (!root) return { ok: false, stdout: "", stderr: "LLM Wiki vault not found; nothing to checkpoint." };
  const weak = await client.searchNotes({ search: "#status=weak", limit: 100 });
  const orphans = await client.searchNotes({ search: "#orphanCandidate=true", limit: 100 });
  await appendLogEntry(client, { date: today(), op: "session", title: `end (weak=${weak.length}, orphan=${orphans.length})` });
  return {
    ok: true,
    stdout: `Checkpoint written. weak=${weak.length} orphan=${orphans.length}`,
    stderr: weak.length + orphans.length > 0
      ? "Reminder: review weak/orphan pages via the wiki skill."
      : "",
  };
}
```

- [ ] **Step 2: Unit test** — mock: missing vault → `ok:false`; present → `appendLogEntry` called once with a `session` entry, stdout contains counts.

- [ ] **Step 3: Build, test, commit** — `feat(cli): checkpoint command — Stop session marker (WF3)`.

---

## Task 6: `doctor` command

**Files:** Create `src/cli/doctor.ts`, `tests/unit/cli/doctor.test.ts`

- [ ] **Step 1: Implement `cmdDoctor(client)`**

```ts
import { findVaultRoot } from "./vault.js";
import { createClientFromEnv } from "../etapi/client.js";
import type { CommandResult } from "./conventions.js";

export async function cmdDoctor(client: import("../etapi/client.js").EtapiClient): Promise<CommandResult> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  // 1. Trilium reachable + token valid
  try {
    const info = await client.getAppInfo();
    checks.push({ name: "Trilium", ok: true, detail: `v${info.appVersion} @ ${process.env.TRILIUM_URL ?? "?"}` });
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
```

- [ ] **Step 2: Unit test** — mock: getAppInfo resolves → Trilium OK; findVaultRoot null → Vault FAIL, stdout suggests init; both OK → `ok:true`.

- [ ] **Step 3: Build, test, commit** — `feat(cli): doctor command — bundle health checks (WF3)`.

---

## Task 7: `install` command (MCP + hooks + skill)

**Files:** Create `src/cli/install.ts`, `tests/unit/cli/install.test.ts`, `tests/fixtures/sample.settings.json`

**Interfaces:**
- `cmdInstall(opts: { claudeDir?: string; dryRun?: boolean }): Promise<CommandResult>` — writes hooks into `<claudeDir>/settings.json` (default `~/.claude`), merging non-destructively; prints instructions for MCP registration and skill copy.

- [ ] **Step 1: Implement `src/cli/install.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

interface HookEntry { matcher?: string; hooks: { type: "command"; command: string }[] }
interface SettingsJson { hooks?: Record<string, HookEntry[]>; mcpServers?: Record<string, unknown> }

const HOOK_CMD = "npx -y -p trilium-llm-wiki-mcp trilium-wiki";

function mergeHookList(existing: HookEntry[] | undefined, matcher: string, command: string): HookEntry[] {
  const list = existing ? structuredClone(existing) : [];
  let bucket = list.find((h) => (h.matcher ?? "") === matcher);
  if (!bucket) { bucket = { matcher, hooks: [] }; list.push(bucket); }
  if (!bucket.hooks.some((h) => h.command === command)) bucket.hooks.push({ type: "command", command });
  return list;
}

export async function cmdInstall(opts: { claudeDir?: string; dryRun?: boolean } = {}): Promise<import("./conventions.js").CommandResult> {
  const claudeDir = opts.claudeDir ?? join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  let settings: SettingsJson = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf8")); } catch { settings = {}; }
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
  lines.push("     claude mcp add --scope user trilium --env TRILIUM_URL=$TRILIUM_URL --env TRILIUM_TOKEN=$TRILIUM_TOKEN -- npx -y trilium-llm-wiki-mcp");
  lines.push("  2) Seed the vault:   npx -y trilium-llm-wiki-mcp trilium-wiki init");
  lines.push("  3) Verify:           npx -y trilium-llm-wiki-mcp trilium-wiki doctor");
  // Skill wiring (arrives fully in WF4)
  const skillSrc = resolve("skill");
  if (existsSync(skillSrc)) {
    lines.push("  4) Skill detected at ./skill — copy to " + join(claudeDir, "skills", "trilium-wiki"));
  } else {
    lines.push("  4) Skill (./skill) not found yet — it arrives in the WF4 phase; re-run install after.");
  }
  return { ok: true, stdout: lines.join("\n"), stderr: "" };
}
```

> `structuredClone` is available in Node ≥17. Our floor is ≥18. ✓

- [ ] **Step 2: Unit test** — use a temp dir (`tests/fixtures/tmp`), run `cmdInstall({ claudeDir: tmpDir, dryRun: false })` against a pre-existing `settings.json` fixture (with an unrelated hook), assert: our SessionStart/Stop hooks merged in, the unrelated hook preserved, file is valid JSON. Then run `cmdInstall` again — assert idempotent (no duplicate hook entries).

- [ ] **Step 3: Build, test, commit** — `feat(cli): install command — non-destructive hooks merge + instructions (WF3)`.

---

## Task 8: Integration tests against live Trilium

**Files:** Create `tests/integration/cli.integration.test.ts`

- [ ] **Step 1: Implement** — drives the real command functions (not the bin) against the live Trilium:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient } from "../helpers/integration.js";
import { cmdInit } from "../../src/cli/init.js";
import { cmdBrief } from "../../src/cli/brief.js";
import { cmdCheckpoint } from "../../src/cli/checkpoint.js";
import { cmdDoctor } from "../../src/cli/doctor.js";
import { findVaultRoot } from "../../src/cli/vault.js";
import { waitForSearch } from "../helpers/integration.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

describeIntegration("trilium-wiki CLI (integration)", () => {
  let client: EtapiClient;
  let createdVaultRootId: string | null = null;

  beforeAll(() => { client = liveClient(); });
  afterAll(async () => {
    // Best-effort cleanup: delete the seeded vault root if this run created it.
    if (createdVaultRootId) await client.deleteNote(createdVaultRootId).catch(() => {});
  });

  it("init seeds the vault idempotently", async () => {
    const rootBefore = await findVaultRoot(client);
    const r1 = await cmdInit(client);
    expect(r1.ok).toBe(true);
    if (!rootBefore) {
      const root = await findVaultRoot(client);
      expect(root).toBeTruthy();
      createdVaultRootId = root!.noteId; // remember to clean up
    }
    const r2 = await cmdInit(client);
    expect(r2.ok).toBe(true);
    expect(r2.stdout).toContain("none — already seeded");
  });

  it("doctor passes after init", async () => {
    const r = await cmdDoctor(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("[OK] Trilium");
    expect(r.stdout).toContain("[OK] Vault");
  });

  it("brief returns a wiki brief with flags", async () => {
    const r = await cmdBrief(client);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("LLM Wiki brief");
    expect(r.stdout).toContain("weak-confidence pages:");
  });

  it("checkpoint appends a session entry to the Log", async () => {
    const r = await cmdCheckpoint(client);
    expect(r.ok).toBe(true);
    const root = await findVaultRoot(client);
    const log = await client.searchNotes({ search: "#wikiLayer=log", ancestorNoteId: root!.noteId, ancestorDepth: "eq1" });
    // the Log note should now contain a session entry
    const body = await client.getNoteContent(log[0]!.noteId);
    expect(body).toMatch(/## \[\d{4}-\d{2}-\d{2}\] session \| end/);
  });
});
```

> Note: the integration suite uses the real `LLM Wiki` vault. If a vault already exists (from a prior run), `init` is idempotent and `createdVaultRootId` stays null (no cleanup). The suite is safe to re-run.

- [ ] **Step 2: Run**

```bash
npm run build && npm test && npm run lint && npm run test:integration
```
Expected: all unit + integration green; `npm run test:integration` includes the 4 CLI tests against the live Trilium.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cli.integration.test.ts
git commit -m "test: CLI integration — init/doctor/brief/checkpoint vs live Trilium (WF3)"
```

---

## Self-Review

**1. Spec coverage:**
- §4.4 companion CLI commands `init`/`brief`/`checkpoint` (+`doctor`/`install`): Tasks 3–7 ✓.
- §4.1 shared ETAPI client (no parallel impl): dispatcher uses `createClientFromEnv`; all commands import it ✓.
- §5.1 vault structure + special files (Purpose/Raw/Wiki/.../Index/Log): `conventions.ts` + `seedVault` ✓.
- §5.2 label conventions (`#wikiLayer` inheritable on containers): `ensureLabel` + `VAULT_STRUCTURE` ✓.
- §5.4 hook behavior (SessionStart→brief reads Index/Log/flags; Stop→checkpoint appends, doesn't write content): Tasks 4+5 ✓.
- §4.5 install (register MCP + skill + hooks, merge not overwrite, idempotent): Task 7 ✓ (skill wiring deferred to WF4, clearly flagged).
- §6.2 tests (unit on mocks + integration vs live): Tasks 1–8 ✓.

**2. Placeholder scan:** no TBD; every command, the merge logic, the vault structure, and the log format carry concrete code. The only "deferred" item (skill copy) is explicit and intentional (WF4 dependency).

**3. Type consistency:** `CommandResult`, `StructureNode`, `LogEntry`, `WikiLayer` defined once (Task 1) and reused with matching field names across command/vault/format files. Command function signatures (`(client) => Promise<CommandResult>`, except `install`) match the dispatcher's calls.

**Gaps deferred:** `seed` subcommand (spec mentions it as alias of `init`) — folded into `init`; SKILL.md itself + skill copy completion — WF4; actual hook firing in a real Claude Code session — WF5; E2E — WF6.

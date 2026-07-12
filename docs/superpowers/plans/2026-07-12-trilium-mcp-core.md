# Trilium MCP Core (WF0+WF1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `trilium-llm-wiki-mcp` — a stdio MCP server giving an agent full ETAPI access to a local TriliumNext instance, with a type-safe ETAPI client and the 18 base tools, all tested against a live Docker Trilium.

**Architecture:** TypeScript ESM, three layers — (1) a single ETAPI client (`src/etapi/client.ts`) wrapping REST with typed direct methods + composite operations, (2) per-tool MCP modules (`src/tools/*.ts`) that translate ETAPI → the MCP tool surface via `McpServer.registerTool`, (3) a stdio bootstrap (`src/index.ts`). Config is env-only. Several "base" tools are composite (ETAPI has no direct endpoints for tree/subtree/path/append/attribute-list/upsert-attribute/move — see Global Constraints §ETAPI gaps).

**Tech Stack:** Node ≥18 (machine has 24), TypeScript 5, `@modelcontextprotocol/sdk@^1.29.0` (v1.x high-level `McpServer`), `zod@^3.25.0`, Vitest 2, ESLint 9 flat config, Prettier 3, Docker (image `triliumnext/notes`).

## Global Constraints

Copied verbatim from the spec + verified environment/research. Every task implicitly satisfies these.

- **Node ≥ 18** (machine: v24.14.1); **npm** 11.11.0; **Docker** 29.2.0 + Compose v5.0.2 (use `docker compose`, not `docker-compose`); shell is **Git Bash / POSIX syntax**; use `curl.exe` if a Windows alias conflicts.
- **ESM project**: `"type": "module"`; tsconfig `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`, `strict: true`; **relative imports keep the `.js` suffix** (`./tools/index.js`) even though source is `.ts`.
- **Config is env-only, no PC-specific paths in committed files**: `TRILIUM_URL`, `TRILIUM_TOKEN`; optional `TRILIUM_TIMEOUT` (ms), `TRILIUM_VERIFY_TLS` (`1`/`0`). Token never logged/committed.
- **Auth header is `Authorization: <token>` with NO `Bearer` prefix.**
- **Clean-room**: no third-party source vendored. License is **MIT**; NOTICE attributes the Karpathy LLM-wiki concept and TriliumNext ETAPI.
- **MCP SDK v1.x patterns**: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`; `StdioServerTransport` from `.../server/stdio.js`; register tools with `server.registerTool(name, {description, inputSchema: ZodRawShape|ZodObject, annotations?}, handler)`. The SDK validates/parses args before calling the handler. Results: `{content:[{type:"text",text}], isError?:true}`.
- **ETAPI gaps (composite ops in code, NOT direct REST):**
  - `get_note_tree` → `GET /notes?search=&ancestorNoteId=<id>&ancestorDepth=eq1` (or walk `childNoteIds`).
  - `get_note_subtree` → `GET /notes?search=&ancestorNoteId=<id>` (whole subtree).
  - `get_note_path` → walk `parentNoteIds[0]` via `GET /notes/{id}` until `root`.
  - `append_to_note` → `GET /notes/{id}/content` + concat + `PUT /notes/{id}/content`.
  - `get_attributes` → `attributes[]` embedded on the `Note` object from `GET /notes/{id}`.
  - `set_attribute` (upsert) → read `attributes[]`, match `type`+`name`, then `PATCH /attributes/{id}` (label: value/position) or DELETE+POST.
  - `move_note` → `DELETE /branches/{oldBranchId}` + `POST /branches` (new parent).
- **Direct ETAPI endpoints used**: `GET /notes?search=...`, `GET/DELETE /notes/{id}`, `GET/PUT /notes/{id}/content`, `PATCH /notes/{id}`, `POST /create-note`, `GET /app-info`, `POST/GET/PATCH/DELETE /branches{,/{id}}`, `POST /refresh-note-ordering/{parentId}`, `POST/GET/PATCH/DELETE /attributes{,/{id}}`, `GET /calendar/days/{date}`, `GET /calendar/weeks/{week}` (ISO `YYYY-W##`), `GET /inbox/{date}`, `POST /auth/login`.
- **Testing**: Vitest. Unit tests mock the ETAPI client (handler-level). Integration tests hit the live Docker Trilium and must clean up their own fixtures; skip automatically when `TRILIUM_TOKEN` is absent.
- **Protected notes**: out of scope (ETAPI blocks them) — tools must surface `NOTE_IS_PROTECTED` as a clear `isError` message.

---

## File Structure

```
trilium-llm-wiki-mcp/
├── package.json                 # type:module, bin (trilium-mcp), scripts, deps
├── tsconfig.json                # NodeNext, strict, outDir dist, rootDir src
├── eslint.config.js             # ESLint 9 flat config + typescript-eslint
├── .prettierrc.json
├── vitest.config.ts             # include tests/**, setupFiles for .env
├── .gitignore                   # node_modules, dist, .env, trilium-data, coverage
├── .env.example                 # TRILIUM_URL/TRILIUM_TOKEN/...
├── .env                         # gitignored — real local values
├── LICENSE                      # MIT
├── NOTICE                       # attribution
├── README.md                    # minimal in WF1 (full quickstart in WF7)
├── .mcp.json                    # project-scope example, env-driven, no abs paths
├── docker-compose.yml           # triliumnext/notes, volume ./trilium-data, 8080:8080
├── scripts/
│   └── get-etapi-token.mjs      # POST /auth/login → write .env (dev convenience)
├── src/
│   ├── index.ts                 # bootstrap: McpServer + registerAllTools + StdioTransport
│   ├── lib/
│   │   ├── config.ts            # loadConfig(): validate env → Config object
│   │   └── errors.ts            # EtapiError class + asToolResult/toolError helpers
│   ├── etapi/
│   │   ├── types.ts             # Note, Branch, Attribute, AppInfo, EtapiErrorPayload, ...
│   │   └── client.ts            # EtapiClient: request engine + direct + composite methods + factory
│   └── tools/
│       ├── index.ts             # registerAllTools(server, client)
│       ├── search.ts            # search_notes
│       ├── notes-read.ts        # get_note, get_note_content, get_note_tree, get_note_subtree, get_note_path, get_app_info
│       ├── notes-write.ts       # create_note, update_note, update_note_content, append_to_note, delete_note, move_note
│       ├── attributes.ts        # get_attributes, set_attribute, delete_attribute
│       └── calendar.ts          # get_day_note, get_week_note, get_inbox_note
└── tests/
    ├── helpers/
    │   ├── etapiFetchMock.ts    # builds a fetch mock returning canned responses
    │   ├── mockClient.ts        # a fake EtapiClient via vi.mocked methods (for tool unit tests)
    │   └── integration.ts       # live client + fixture root setup/teardown
    ├── unit/
    │   ├── lib/config.test.ts
    │   ├── lib/errors.test.ts
    │   ├── etapi/client.test.ts
    │   └── tools/{search,notes-read,notes-write,attributes,calendar}.test.ts
    └── integration/
        ├── notes.integration.test.ts
        ├── attributes.integration.test.ts
        ├── branches-move.integration.test.ts
        └── calendar.integration.test.ts
```

**Responsibilities:**
- `src/etapi/client.ts` — the ONE ETAPI module (spec §4.1). Both the MCP server and (later, WF3) the companion CLI use it. Holds the fetch engine, auth header, timeout, retries, error mapping, and every direct + composite method.
- `src/tools/*.ts` — each tool is a pure handler function (exported, testable without MCP) plus a `register…(server, client)` function. Thin translation only.
- `src/lib/errors.ts` — `EtapiError` (carries `code`/`status`) and the `asToolResult` helper that turns client results/errors into MCP `CallToolResult`.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `NOTICE`, `README.md` (stub)
- Test: `tests/unit/sanity.test.ts`

**Interfaces:**
- Produces: a buildable, lintable, testable ESM TypeScript project. `npm run build`, `npm test`, `npm run lint` all work (test green with one passing sanity test).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trilium-llm-wiki-mcp",
  "version": "0.1.0",
  "description": "MCP server + LLM-wiki skill for Trilium/TriliumNext Notes (Karpathy LLM-wiki methodology).",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=18" },
  "bin": { "trilium-mcp": "dist/index.js" },
  "exports": { ".": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `eslint.config.js` (flat)**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "trilium-data/**", "coverage/**"],
  },
);
```

Add `"@eslint/js": "^9.0.0"` to devDependencies (install resolves it).

- [ ] **Step 4: Create `.prettierrc.json`**

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/load-env.ts"],
  },
});
```

Create `tests/helpers/load-env.ts`:

```ts
// Loads .env into process.env for tests (dev convenience). Noop if .env absent.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && m[2] !== undefined && !process.env[m[1]]) {
      process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
}
```

- [ ] **Step 6: Create `.gitignore`, `LICENSE` (MIT, holder "DragonQi", year 2026), `NOTICE`, `README.md` stub**

`.gitignore`:
```
node_modules/
dist/
coverage/
.env
trilium-data/
*.log
```

`NOTICE`:
```
trilium-llm-wiki-mcp
Copyright (c) 2026 DragonQi — Licensed under the MIT License (see LICENSE).

This product includes a clean-room implementation of the "LLM-wiki" personal
knowledge methodology described by Andrej Karpathy (public gist, 2025). No
source code from that gist is included; only the methodology is followed.

ETAPI access is provided for Trilium Notes / TriliumNext Notes
(https://github.com/TriliumNext/Notes). This project is independent and not
affiliated with or endorsed by TriliumNext.
```

`README.md` (stub — full quickstart arrives in WF7):
```markdown
# trilium-llm-wiki-mcp

MCP server exposing Trilium/TriliumNext Notes via ETAPI, plus an LLM-wiki
skill (Karpathy methodology) where Trilium is the single wiki backend.

Status: WF0+WF1 (core MCP + 18 base tools). Full quickstart in a later phase.

## Develop
```bash
npm install
npm run build
npm test
```
```

- [ ] **Step 7: Write the failing sanity test `tests/unit/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install, build, lint, test**

Run:
```bash
npm install
npm run build
npm run lint
npm test
```
Expected: install succeeds; `tsc` emits `dist/`; lint clean; 1 test passing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold ESM TypeScript project with ESLint/Prettier/Vitest (WF0)"
```

---

## Task 2: Docker Compose + TriliumNext + ETAPI token

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `scripts/get-etapi-token.mjs`, `vitest.integration.config.ts`
- Modify: `.gitignore` (already has `.env`, `trilium-data/`)

**Interfaces:**
- Produces: a running local TriliumNext at `http://localhost:8080`, a valid `TRILIUM_TOKEN` in `.env`, and `app-info` reachable. Integration tests can run.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  trilium:
    image: triliumnext/notes:latest
    container_name: trilium-llm-wiki
    ports:
      - "8080:8080"
    volumes:
      - ./trilium-data:/root/trilium-data
    restart: unless-stopped
```

- [ ] **Step 2: Create `.env.example`**

```bash
# Trilium ETAPI connection (local Docker instance by default)
TRILIUM_URL=http://localhost:8080
TRILIUM_TOKEN=
# Optional:
# TRILIUM_TIMEOUT=30000
# TRILIUM_VERIFY_TLS=1
# Password used by scripts/get-etapi-token.mjs to log in (dev only; never commit):
# TRILIUM_PASSWORD=
```

- [ ] **Step 3: Start TriliumNext and initialize it**

Run:
```bash
cp -n .env.example .env || true
docker compose up -d
```
Then open `http://localhost:8080` in a browser **once** and complete the first-run setup (choose a password). This initializes the database under `./trilium-data`. Put that password in `.env` as `TRILIUM_PASSWORD=<your-password>` (dev only, gitignored).

Expected: `docker compose ps` shows the container healthy; `GET /` returns the Trilium UI.

> Note: TriliumNext has no first-run-password env var in the official image; the UI wizard is required exactly once. If a future image adds one, prefer it.

- [ ] **Step 4: Create `scripts/get-etapi-token.mjs`**

```js
#!/usr/bin/env node
// Dev convenience: logs into the local Trilium via TRILIUM_PASSWORD and prints
// an ETAPI authToken. Usage: node scripts/get-etapi-token.mjs
// Writes/updates TRILIUM_TOKEN=... in .env if --write is passed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const url = process.env.TRILIUM_URL ?? "http://localhost:8080";
const password = process.env.TRILIUM_PASSWORD;
const tokenName = process.env.TRILIUM_TOKEN_NAME ?? "trilium-mcp-dev";
if (!password) {
  console.error("Set TRILIUM_PASSWORD in .env first.");
  process.exit(1);
}

const res = await fetch(`${url}/etapi/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password, tokenName }),
});
if (!res.ok) {
  console.error(`Login failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { authToken } = await res.json();
console.log(authToken);

if (process.argv.includes("--write")) {
  const envPath = ".env";
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^TRILIUM_TOKEN=/m.test(body)) {
    body = body.replace(/^TRILIUM_TOKEN=.*/m, `TRILIUM_TOKEN=${authToken}`);
  } else {
    body += `\nTRILIUM_TOKEN=${authToken}\n`;
  }
  writeFileSync(envPath, body);
  console.error("Wrote TRILIUM_TOKEN to .env");
}
```

- [ ] **Step 5: Obtain the token and verify `app-info`**

Run:
```bash
# load password into shell, get token, write to .env
export TRILIUM_PASSWORD=$(grep -E '^TRILIUM_PASSWORD=' .env | cut -d= -f2-)
node scripts/get-etapi-token.mjs --write
# verify
TOKEN=$(grep -E '^TRILIUM_TOKEN=' .env | cut -d= -f2-)
curl.exe -sS -H "Authorization: $TOKEN" http://localhost:8080/etapi/app-info
```
Expected: a JSON object containing `"appVersion":"..."`. If you get `401 NOT_AUTHENTICATED`, the password/token is wrong.

- [ ] **Step 6: Create `vitest.integration.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/load-env.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example scripts/get-etapi-token.mjs vitest.integration.config.ts
git commit -m "chore: add Docker TriliumNext + ETAPI token helper (WF0)"
```

---

## Task 3: Config module

**Files:**
- Create: `src/lib/config.ts`
- Test: `tests/unit/lib/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` where `Config = { url: string; token: string; timeoutMs: number; verifyTls: boolean }`. Throws on missing `TRILIUM_URL`/`TRILIUM_TOKEN`. `url` has trailing slash stripped.

- [ ] **Step 1: Write failing test**

`tests/unit/lib/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../../../src/lib/config.js";

describe("loadConfig", () => {
  it("parses required + optional fields with defaults", () => {
    const cfg = loadConfig({ TRILIUM_URL: "http://localhost:8080/", TRILIUM_TOKEN: "abc" });
    expect(cfg).toEqual({ url: "http://localhost:8080", token: "abc", timeoutMs: 30000, verifyTls: true });
  });

  it("respects optional overrides", () => {
    const cfg = loadConfig({
      TRILIUM_URL: "https://t.example.com",
      TRILIUM_TOKEN: "x",
      TRILIUM_TIMEOUT: "5000",
      TRILIUM_VERIFY_TLS: "0",
    });
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.verifyTls).toBe(false);
  });

  it("throws on missing url", () => {
    expect(() => loadConfig({ TRILIUM_TOKEN: "x" })).toThrow(/TRILIUM_URL/);
  });

  it("throws on missing token", () => {
    expect(() => loadConfig({ TRILIUM_URL: "http://x" })).toThrow(/TRILIUM_TOKEN/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/unit/lib/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/config.ts`**

```ts
export interface Config {
  url: string;
  token: string;
  timeoutMs: number;
  verifyTls: boolean;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var ${key}`);
  }
  return v.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const url = required(env, "TRILIUM_URL").replace(/\/+$/, "");
  const token = required(env, "TRILIUM_TOKEN");
  const timeoutMs = env.TRILIUM_TIMEOUT ? Number.parseInt(env.TRILIUM_TIMEOUT, 10) : 30000;
  const verifyTls = env.TRILIUM_VERIFY_TLS ? env.TRILIUM_VERIFY_TLS !== "0" : true;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`TRILIUM_TIMEOUT must be a positive integer (got ${env.TRILIUM_TIMEOUT})`);
  }
  return { url, token, timeoutMs, verifyTls };
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- tests/unit/lib/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts tests/unit/lib/config.test.ts
git commit -m "feat(config): env-driven Trilium connection config (WF1)"
```

---

## Task 4: ETAPI types

**Files:**
- Create: `src/etapi/types.ts`

**Interfaces:**
- Produces: TypeScript types for all ETAPI entities used by the client and tools. Pure types — no runtime, tested indirectly via client/tool tests.

- [ ] **Step 1: Implement `src/etapi/types.ts`**

```ts
// ETAPI entity types (camelCase, per TriliumNext ETAPI).

export type NoteType =
  | "text" | "code" | "render" | "file" | "image" | "search"
  | "relationMap" | "book" | "noteMap" | "mermaid" | "webView"
  | "shortcut" | "doc" | "contentWidget" | "launcher";

export type CreateNoteType =
  | "text" | "code" | "file" | "image" | "search" | "book" | "relationMap" | "render";

export type AttributeType = "label" | "relation";

export interface Note {
  noteId: string;
  isProtected: boolean;
  title: string;
  type: NoteType;
  mime: string;
  blobId?: string;
  dateCreated: string;
  dateModified: string;
  utcDateCreated: string;
  utcDateModified: string;
  parentNoteIds: string[];
  childNoteIds: string[];
  parentBranchIds: string[];
  childBranchIds: string[];
  attributes: Attribute[];
}

export interface Branch {
  branchId: string;
  noteId: string;
  parentNoteId: string;
  prefix: string;
  notePosition: number;
  isExpanded: boolean;
  utcDateModified: string;
}

export interface Attribute {
  attributeId: string;
  noteId: string;
  type: AttributeType;
  name: string;
  value: string;
  position: number;
  isInheritable: boolean;
  utcDateModified: string;
}

export interface AppInfo {
  appVersion: string;
  dbVersion: number;
  syncVersion: number;
  buildDate: string;
  buildRevision: string;
  dataDirectory: string;
  clipperProtocolVersion: string;
  utcDateTime: string;
}

export interface CreateNoteInput {
  parentNoteId: string;
  title: string;
  type: CreateNoteType;
  content: string;
  mime?: string;
  notePosition?: number;
  prefix?: string;
  noteId?: string;
  branchId?: string;
}

export interface CreateNoteResult {
  note: Note;
  branch: Branch;
}

export interface UpdateNoteInput {
  title?: string;
  type?: NoteType;
  mime?: string;
  dateCreated?: string;
  utcDateCreated?: string;
}

export interface CreateBranchInput {
  noteId: string;
  parentNoteId: string;
  notePosition?: number;
  prefix?: string;
  isExpanded?: boolean;
}

export interface CreateAttributeInput {
  noteId: string;
  type: AttributeType;
  name: string;
  value?: string;
  isInheritable?: boolean;
  position?: number;
}

export interface SearchNotesParams {
  search: string;
  fastSearch?: boolean;
  includeArchivedNotes?: boolean;
  ancestorNoteId?: string;
  ancestorDepth?: string; // e.g. "eq1", "lt3"
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  limit?: number;
  debug?: boolean;
}

export interface EtapiErrorPayload {
  status: number;
  code: string;
  message: string;
}

// Composite: a node in a recursive subtree walk.
export interface SubtreeNode {
  note: Note;
  children: SubtreeNode[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: `dist/etapi/types.js`/`.d.ts` emitted; no errors.

- [ ] **Step 3: Commit**

```bash
git add src/etapi/types.ts
git commit -m "feat(etapi): add ETAPI entity types (WF1)"
```

---

## Task 5: Errors + result helpers

**Files:**
- Create: `src/lib/errors.ts`
- Test: `tests/unit/lib/errors.test.ts`

**Interfaces:**
- Consumes: `EtapiErrorPayload` from `src/etapi/types.ts`.
- Produces:
  - `class EtapiError extends Error { readonly status: number; readonly code: string; }`
  - `function toolError(message: string): CallToolResult`
  - `function asToolResult<T>(fn: () => Promise<T>, stringify: (v: T) => string): Promise<CallToolResult>`
  - `CallToolResult` type re-exported for convenience.

- [ ] **Step 1: Write failing test**

`tests/unit/lib/errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { EtapiError, toolError, asToolResult } from "../../../src/lib/errors.js";

describe("EtapiError", () => {
  it("carries status + code", () => {
    const e = new EtapiError({ status: 404, code: "NOTE_NOT_FOUND", message: "nope" });
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOTE_NOT_FOUND");
    expect(e.message).toBe("nope");
    expect(e instanceof Error).toBe(true);
  });
});

describe("toolError", () => {
  it("returns an isError result", () => {
    expect(toolError("boom")).toEqual({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
  });
});

describe("asToolResult", () => {
  it("stringifies success", async () => {
    const r = await asToolResult(() => Promise.resolve({ a: 1 }), (v) => JSON.stringify(v));
    expect(r).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
  });

  it("maps EtapiError to isError with code hint", async () => {
    const r = await asToolResult(
      () => Promise.reject(new EtapiError({ status: 404, code: "NOTE_NOT_FOUND", message: "missing" })),
      JSON.stringify,
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("NOTE_NOT_FOUND");
    expect((r.content[0] as { text: string }).text).toContain("missing");
  });

  it("maps 5xx with retry hint", async () => {
    const r = await asToolResult(
      () => Promise.reject(new EtapiError({ status: 503, code: "GENERIC", message: "down" })),
      JSON.stringify,
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("retry");
  });

  it("maps generic Error to isError", async () => {
    const r = await asToolResult(() => Promise.reject(new Error("oops")), JSON.stringify);
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("oops");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/unit/lib/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/errors.ts`**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EtapiErrorPayload } from "../etapi/types.js";

export type { CallToolResult };

export class EtapiError extends Error implements EtapiErrorPayload {
  readonly status: number;
  readonly code: string;
  constructor(payload: EtapiErrorPayload) {
    super(payload.message);
    this.name = "EtapiError";
    this.status = payload.status;
    this.code = payload.code;
  }
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export async function asToolResult<T>(
  fn: () => Promise<T>,
  stringify: (v: T) => string,
): Promise<CallToolResult> {
  try {
    const value = await fn();
    return { content: [{ type: "text", text: stringify(value) }] };
  } catch (err) {
    if (err instanceof EtapiError) {
      const retry = err.status >= 500 ? " (upstream failing; you may retry shortly)" : "";
      return toolError(`ETAPI ${err.code} (${err.status}): ${err.message}${retry}`);
    }
    return toolError(err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- tests/unit/lib/errors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors.ts tests/unit/lib/errors.test.ts
git commit -m "feat(errors): EtapiError + asToolResult MCP result helper (WF1)"
```

---

## Task 6: ETAPI client — request engine

**Files:**
- Create: `src/etapi/client.ts`
- Create: `tests/helpers/etapiFetchMock.ts`
- Test: `tests/unit/etapi/client.test.ts` (engine + auth + error mapping only in this task; methods in Tasks 7–8)

**Interfaces:**
- Consumes: `Config` (`src/lib/config.ts`), `EtapiError`/types.
- Produces:
  - `class EtapiClient { constructor(cfg: Config) }` with a `protected async request<T>(method, path, opts?): Promise<T>` engine.
  - `function createClientFromEnv(): EtapiClient`.
  - The engine: prepends `${cfg.url}/etapi`, sets `Authorization: cfg.token` (no Bearer), JSON body, `AbortController` timeout = `cfg.timeoutMs`, parses `{status,code,message}` errors → throws `EtapiError`, retries idempotent requests on 5xx/connection errors once after 250 ms.

- [ ] **Step 1: Create fetch mock helper**

`tests/helpers/etapiFetchMock.ts`:
```ts
type ResponseSpec = { status?: number; body?: unknown; headers?: Record<string, string> };

export function makeFetchMock(routes: Array<{ match: RegExp; method?: string; respond: ResponseSpec | (() => ResponseSpec) }>) {
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  const stub = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ method, url, init });
    const route = routes.find((r) => (r.method ?? "GET") === method && r.match.test(url));
    if (!route) throw new Error(`fetch mock: no route for ${method} ${url}`);
    const spec = typeof route.respond === "function" ? route.respond() : route.respond;
    const status = spec.status ?? 200;
    const body = spec.body;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(spec.headers),
      async text() {
        return typeof body === "string" ? body : JSON.stringify(body ?? "");
      },
      async json() {
        return typeof body === "string" ? JSON.parse(body) : body;
      },
    } as Response;
  };
  return { stub, calls };
}
```

- [ ] **Step 2: Write failing test for the engine**

`tests/unit/etapi/client.test.ts` (engine portion):
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeFetchMock } from "../../helpers/etapiFetchMock.js";
import { EtapiError } from "../../../src/lib/errors.js";
import { loadConfig } from "../../../src/lib/config.js";

// request() is the protected engine; expose it for testing via a subclass.
let fetchMock: ReturnType<typeof makeFetchMock>;

beforeEach(() => {
  fetchMock = makeFetchMock([]);
  vi.stubGlobal("fetch", fetchMock.stub);
});
afterEach(() => vi.unstubAllGlobals());

// Helper: build a client that uses our stubbed fetch and a short timeout.
async function makeClient() {
  const { EtapiClient } = await import("../../../src/etapi/client.js");
  const cfg = loadConfig({ TRILIUM_URL: "http://t:8080", TRILIUM_TOKEN: "tok", TRILIUM_TIMEOUT: "1000" });
  return new EtapiClient(cfg);
}

describe("EtapiClient engine", () => {
  it("sends Authorization header without Bearer and JSON body", async () => {
    fetchMock.routes = [{ match: /\/etapi\/app-info$/, respond: { body: { appVersion: "1" } } }];
    const client = await makeClient();
    // @ts-expect-error access protected for test
    await client.request<void>("GET", "/app-info");
    const init = fetchMock.calls[0]!.init!;
    expect((init.headers as Record<string, string>).Authorization).toBe("tok");
    expect(fetchMock.calls[0]!.url).toBe("http://t:8080/etapi/app-info");
  });

  it("throws EtapiError on 4xx with code+message", async () => {
    fetchMock.routes = [
      { match: /\/notes\/bad$/, respond: { status: 404, body: { status: 404, code: "NOTE_NOT_FOUND", message: "no" } } },
    ];
    const client = await makeClient();
    await expect(
      // @ts-expect-error
      client.request<void>("GET", "/notes/bad"),
    ).rejects.toMatchObject({ status: 404, code: "NOTE_NOT_FOUND", message: "no" });
  });

  it("retries once on 503 for idempotent GET", async () => {
    let tries = 0;
    fetchMock.routes = [
      {
        match: /\/app-info$/,
        respond: () => {
          tries++;
          return tries === 1 ? { status: 503, body: { status: 503, code: "GENERIC", message: "x" } } : { body: { appVersion: "1" } };
        },
      },
    ];
    const client = await makeClient();
    // @ts-expect-error
    const v = await client.request<{ appVersion: string }>("GET", "/app-info");
    expect(v.appVersion).toBe("1");
    expect(tries).toBe(2);
  });
});
```

> Note: the test reaches `request` via `@ts-expect-error` because it is protected. If your lint config blocks `@ts-expect-error`, expose a `__requestForTest` public alias instead and adjust the test.

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the client engine in `src/etapi/client.ts`**

```ts
import type { Config } from "../lib/config.js";
import { EtapiError } from "../lib/errors.js";
import type { EtapiErrorPayload } from "./types.js";

const RETRY_DELAY_MS = 250;

export class EtapiClient {
  protected readonly cfg: Config;
  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  protected async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; retry?: boolean } = {},
  ): Promise<T> {
    const url = new URL(`${this.cfg.url}/etapi${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createClientFromEnv(): EtapiClient {
  // Lazy import to avoid circular import at module load.
  const { loadConfig } = require("../lib/config.js") as typeof import("../lib/config.js");
  return new EtapiClient(loadConfig());
}
```

> Note: `require` is not available in ESM. Replace the `createClientFromEnv` body with a static import at the top of the file: `import { loadConfig } from "../lib/config.js";` and `return new EtapiClient(loadConfig());`. (Keep the import at the top — no cycle exists since `config.ts` does not import `client.ts`.)

- [ ] **Step 5: Fix `createClientFromEnv` to use a top-level import (correct ESM)**

Edit the top of `src/etapi/client.ts` to add `import { loadConfig } from "../lib/config.js";` and simplify:
```ts
export function createClientFromEnv(): EtapiClient {
  return new EtapiClient(loadConfig());
}
```
Remove the inline `require(...)` version entirely.

- [ ] **Step 6: Run test, verify pass**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: PASS (3 tests). Build stays clean: `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add src/etapi/client.ts tests/helpers/etapiFetchMock.ts tests/unit/etapi/client.test.ts
git commit -m "feat(etapi): request engine with auth, timeout, retries, error mapping (WF1)"
```

---

## Task 7: ETAPI client — direct methods

**Files:**
- Modify: `src/etapi/client.ts` (add direct methods)
- Modify: `tests/unit/etapi/client.test.ts` (add method tests)

**Interfaces:**
- Produces (all on `EtapiClient`, returning typed results; these are the methods tools call):
  - `getAppInfo(): Promise<AppInfo>`
  - `getNote(noteId): Promise<Note>`
  - `getNoteContent(noteId): Promise<string>`
  - `createNote(input: CreateNoteInput): Promise<CreateNoteResult>`
  - `updateNote(noteId, patch: UpdateNoteInput): Promise<Note>`
  - `updateNoteContent(noteId, content: string): Promise<void>`
  - `deleteNote(noteId): Promise<void>`
  - `searchNotes(params: SearchNotesParams): Promise<Note[]>`
  - `getAttribute(attributeId): Promise<Attribute>`
  - `createAttribute(input: CreateAttributeInput): Promise<Attribute>`
  - `updateAttribute(attributeId, patch: { value?: string; position?: number }): Promise<Attribute>`
  - `deleteAttribute(attributeId): Promise<void>`
  - `getBranch(branchId): Promise<Branch>`
  - `createBranch(input: CreateBranchInput): Promise<Branch>`
  - `updateBranch(branchId, patch: Partial<Pick<Branch,"notePosition"|"prefix"|"isExpanded">>): Promise<Branch>`
  - `deleteBranch(branchId): Promise<void>`
  - `refreshNoteOrdering(parentNoteId): Promise<void>`
  - `getDayNote(date: string /* YYYY-MM-DD */): Promise<Note>`
  - `getWeekNote(week: string /* YYYY-W## */): Promise<Note>`
  - `getInboxNote(date: string /* YYYY-MM-DD */): Promise<Note>`

- [ ] **Step 1: Write failing tests for direct methods (append to `client.test.ts`)**

```ts
import type { Note, Attribute, Branch } from "../../../src/etapi/types.js";

describe("EtapiClient direct methods", () => {
  it("searchNotes passes params and returns results[]", async () => {
    fetchMock.routes = [
      { match: /\/notes\?search=towers/, method: "GET", respond: { body: { results: [{ noteId: "a", title: "T" } as Note] } } },
    ];
    const client = await makeClient();
    const out = await client.searchNotes({ search: "towers", limit: 5 });
    expect(out).toHaveLength(1);
    expect(fetchMock.calls[0]!.url).toContain("search=towers");
    expect(fetchMock.calls[0]!.url).toContain("limit=5");
  });

  it("createNote POSTs to /create-note", async () => {
    fetchMock.routes = [
      { match: /\/create-note$/, method: "POST", respond: { status: 201, body: { note: { noteId: "n1" } as Note, branch: { branchId: "b1" } as Branch } } },
    ];
    const client = await makeClient();
    const r = await client.createNote({ parentNoteId: "root", title: "X", type: "text", content: "<p>x</p>" });
    expect(r.note.noteId).toBe("n1");
    expect(fetchMock.calls[0]!.init!.method).toBe("POST");
    expect(fetchMock.calls[0]!.url).toBe("http://t:8080/etapi/create-note");
  });

  it("updateNoteContent PUTs text/plain body", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = await makeClient();
    await expect(client.updateNoteContent("n1", "<p>new</p>")).resolves.toBeUndefined();
  });

  it("createAttribute POSTs to /attributes", async () => {
    fetchMock.routes = [
      { match: /\/attributes$/, method: "POST", respond: { status: 201, body: { attributeId: "a1", type: "label", name: "k", value: "v" } as Attribute } },
    ];
    const client = await makeClient();
    const a = await client.createAttribute({ noteId: "n1", type: "label", name: "k", value: "v" });
    expect(a.attributeId).toBe("a1");
  });

  it("createBranch POSTs to /branches", async () => {
    fetchMock.routes = [
      { match: /\/branches$/, method: "POST", respond: { status: 201, body: { branchId: "br1", noteId: "n1", parentNoteId: "root" } as Branch } },
    ];
    const client = await makeClient();
    const b = await client.createBranch({ noteId: "n1", parentNoteId: "root" });
    expect(b.branchId).toBe("br1");
  });

  it("getInboxNote hits /inbox/{date}", async () => {
    fetchMock.routes = [
      { match: /\/inbox\/2026-07-12$/, method: "GET", respond: { body: { noteId: "inbox" } as Note } },
    ];
    const client = await makeClient();
    const n = await client.getInboxNote("2026-07-12");
    expect(n.noteId).toBe("inbox");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Add direct methods to `EtapiClient` (append before the closing brace)**

```ts
  // ---- direct endpoints ----
  getAppInfo(): Promise<import("./types.js").AppInfo> {
    return this.request<import("./types.js").AppInfo>("GET", "/app-info");
  }
  getNote(noteId: string): Promise<import("./types.js").Note> {
    return this.request<import("./types.js").Note>("GET", `/notes/${encodeURIComponent(noteId)}`);
  }
  getNoteContent(noteId: string): Promise<string> {
    return this.requestText("GET", `/notes/${encodeURIComponent(noteId)}/content`);
  }
  createNote(input: import("./types.js").CreateNoteInput): Promise<import("./types.js").CreateNoteResult> {
    return this.request<import("./types.js").CreateNoteResult>("POST", "/create-note", { body: input });
  }
  updateNote(noteId: string, patch: import("./types.js").UpdateNoteInput): Promise<import("./types.js").Note> {
    return this.request<import("./types.js").Note>("PATCH", `/notes/${encodeURIComponent(noteId)}`, { body: patch });
  }
  updateNoteContent(noteId: string, content: string): Promise<void> {
    return this.requestText("PUT", `/notes/${encodeURIComponent(noteId)}/content`, { body: content }).then(() => undefined);
  }
  deleteNote(noteId: string): Promise<void> {
    return this.request<void>("DELETE", `/notes/${encodeURIComponent(noteId)}`);
  }
  searchNotes(params: import("./types.js").SearchNotesParams): Promise<import("./types.js").Note[]> {
    return this.request<{ results: import("./types.js").Note[] }>("GET", "/notes", {
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
  getAttribute(attributeId: string): Promise<import("./types.js").Attribute> {
    return this.request<import("./types.js").Attribute>("GET", `/attributes/${encodeURIComponent(attributeId)}`);
  }
  createAttribute(input: import("./types.js").CreateAttributeInput): Promise<import("./types.js").Attribute> {
    return this.request<import("./types.js").Attribute>("POST", "/attributes", { body: input });
  }
  updateAttribute(
    attributeId: string,
    patch: { value?: string; position?: number },
  ): Promise<import("./types.js").Attribute> {
    return this.request<import("./types.js").Attribute>("PATCH", `/attributes/${encodeURIComponent(attributeId)}`, { body: patch });
  }
  deleteAttribute(attributeId: string): Promise<void> {
    return this.request<void>("DELETE", `/attributes/${encodeURIComponent(attributeId)}`);
  }
  getBranch(branchId: string): Promise<import("./types.js").Branch> {
    return this.request<import("./types.js").Branch>("GET", `/branches/${encodeURIComponent(branchId)}`);
  }
  createBranch(input: import("./types.js").CreateBranchInput): Promise<import("./types.js").Branch> {
    return this.request<import("./types.js").Branch>("POST", "/branches", { body: input });
  }
  updateBranch(
    branchId: string,
    patch: Partial<Pick<import("./types.js").Branch, "notePosition" | "prefix" | "isExpanded">>,
  ): Promise<import("./types.js").Branch> {
    return this.request<import("./types.js").Branch>("PATCH", `/branches/${encodeURIComponent(branchId)}`, { body: patch });
  }
  deleteBranch(branchId: string): Promise<void> {
    return this.request<void>("DELETE", `/branches/${encodeURIComponent(branchId)}`);
  }
  refreshNoteOrdering(parentNoteId: string): Promise<void> {
    return this.request<void>("POST", `/refresh-note-ordering/${encodeURIComponent(parentNoteId)}`);
  }
  getDayNote(date: string): Promise<import("./types.js").Note> {
    return this.request<import("./types.js").Note>("GET", `/calendar/days/${encodeURIComponent(date)}`);
  }
  getWeekNote(week: string): Promise<import("./types.js").Note> {
    return this.request<import("./types.js").Note>("GET", `/calendar/weeks/${encodeURIComponent(week)}`);
  }
  getInboxNote(date: string): Promise<import("./types.js").Note> {
    return this.request<import("./types.js").Note>("GET", `/inbox/${encodeURIComponent(date)}`);
  }
```

> To keep the class readable, prefer replacing these `import("./types.js").X` inline types by adding top-level imports (`import type { AppInfo, Note, ... } from "./types.js";`) and using the bare names. Do that cleanup in this step rather than leaving inline imports.

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: PASS (all direct-method tests + earlier engine tests).

- [ ] **Step 5: Commit**

```bash
git add src/etapi/client.ts tests/unit/etapi/client.test.ts
git commit -m "feat(etapi): direct ETAPI methods (notes/branches/attributes/calendar/app-info) (WF1)"
```

---

## Task 8: ETAPI client — composite methods

**Files:**
- Modify: `src/etapi/client.ts`
- Modify: `tests/unit/etapi/client.test.ts`

**Interfaces:**
- Produces:
  - `getNoteTree(noteId, opts?: {limit?: number}): Promise<Note[]>` — direct children via search `?search=&ancestorNoteId=<id>&ancestorDepth=eq1&limit=`.
  - `getNoteSubtree(noteId, opts?: {maxNodes?: number; maxPerNode?: number}): Promise<SubtreeNode>` — recursive walk of `childNoteIds`, breadth-first, capped.
  - `getNotePath(noteId): Promise<Note[]>` — ancestors from immediate parent up to `root`.
  - `appendToNote(noteId, fragment): Promise<void>` — GET content + concat + PUT.
  - `getNoteAttributes(noteId): Promise<Attribute[]>` — `getNote` then return `.attributes`.
  - `upsertAttribute(input: CreateAttributeInput): Promise<Attribute>` — read note attrs, match `type`+`name`; if found PATCH value/position (or DELETE+POST for type/isInheritable changes), else POST.
  - `moveNote(noteId, toParentNoteId, opts?: {notePosition?: number; prefix?: string}): Promise<Branch>` — find old branch, `DELETE` it, then `POST` new branch.

- [ ] **Step 1: Write failing tests (append)**

```ts
describe("EtapiClient composite methods", () => {
  it("getNoteTree searches depth eq1", async () => {
    fetchMock.routes = [
      { match: /\/notes\?search=&ancestorNoteId=root&ancestorDepth=eq1/, method: "GET",
        respond: { body: { results: [{ noteId: "c1" } as Note] } } },
    ];
    const client = await makeClient();
    const kids = await client.getNoteTree("root");
    expect(kids[0]!.noteId).toBe("c1");
  });

  it("getNoteAttributes reads embedded attributes", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1$/, method: "GET",
        respond: { body: { noteId: "n1", attributes: [{ attributeId: "a1", name: "k", value: "v", type: "label" } as Attribute] } as Note } },
    ];
    const client = await makeClient();
    const attrs = await client.getNoteAttributes("n1");
    expect(attrs[0]!.name).toBe("k");
  });

  it("upsertAttribute PATCHes existing label", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1$/, method: "GET",
        respond: { body: { noteId: "n1", attributes: [{ attributeId: "a1", type: "label", name: "k", value: "old", position: 0 } as Attribute] } as Note } },
      { match: /\/attributes\/a1$/, method: "PATCH",
        respond: { body: { attributeId: "a1", type: "label", name: "k", value: "new", position: 0 } as Attribute } },
    ];
    const client = await makeClient();
    const a = await client.upsertAttribute({ noteId: "n1", type: "label", name: "k", value: "new" });
    expect(a.value).toBe("new");
    expect(fetchMock.calls.find((c) => c.method === "PATCH")).toBeTruthy();
  });

  it("upsertAttribute POSTs when label absent", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1$/, method: "GET", respond: { body: { noteId: "n1", attributes: [] } as Note } },
      { match: /\/attributes$/, method: "POST",
        respond: { status: 201, body: { attributeId: "a2", type: "label", name: "k", value: "v" } as Attribute } },
    ];
    const client = await makeClient();
    const a = await client.upsertAttribute({ noteId: "n1", type: "label", name: "k", value: "v" });
    expect(a.attributeId).toBe("a2");
  });

  it("appendToNote GETs then PUTs", async () => {
    let putBody: string | undefined;
    fetchMock.routes = [
      { match: /\/notes\/n1\/content$/, method: "GET", respond: { body: "<p>a</p>" } },
      { match: /\/notes\/n1\/content$/, method: "PUT", respond: { status: 204, body: "" } },
    ];
    const client = await makeClient();
    await client.appendToNote("n1", "<p>b</p>");
    putBody = fetchMock.calls.find((c) => c.method === "PUT")!.init!.body as string;
    expect(putBody).toBe("<p>a</p><p>b</p>");
  });

  it("moveNote deletes old branch and posts new", async () => {
    fetchMock.routes = [
      { match: /\/notes\/n1$/, method: "GET",
        respond: { body: { noteId: "n1", parentNoteIds: ["oldParent"], parentBranchIds: ["brOld"] } as Note } },
      { match: /\/branches\/brOld$/, method: "DELETE", respond: { status: 204, body: "" } },
      { match: /\/branches$/, method: "POST",
        respond: { status: 201, body: { branchId: "brNew", noteId: "n1", parentNoteId: "newParent" } as Branch } },
    ];
    const client = await makeClient();
    const b = await client.moveNote("n1", "newParent");
    expect(b.parentNoteId).toBe("newParent");
    expect(fetchMock.calls.find((c) => c.method === "DELETE")).toBeTruthy();
  });

  it("getNotePath walks parents to root", async () => {
    fetchMock.routes = [
      { match: /\/notes\/child$/, method: "GET",
        respond: { body: { noteId: "child", parentNoteIds: ["mid"] } as Note } },
      { match: /\/notes\/mid$/, method: "GET",
        respond: { body: { noteId: "mid", parentNoteIds: ["root"] } as Note } },
      { match: /\/notes\/root$/, method: "GET",
        respond: { body: { noteId: "root", parentNoteIds: ["none"] } as Note } },
    ];
    const client = await makeClient();
    const path = await client.getNotePath("child");
    expect(path.map((n) => n.noteId)).toEqual(["mid", "root"]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Implement composite methods (append to `EtapiClient`)**

```ts
  // ---- composite methods (ETAPI has no direct endpoint) ----
  getNoteTree(noteId: string, opts: { limit?: number } = {}): Promise<import("./types.js").Note[]> {
    return this.searchNotes({ search: "", ancestorNoteId: noteId, ancestorDepth: "eq1", limit: opts.limit ?? 50 });
  }

  async getNoteSubtree(
    noteId: string,
    opts: { maxNodes?: number; maxPerNode?: number } = {},
  ): Promise<import("./types.js").SubtreeNode> {
    const maxNodes = opts.maxNodes ?? 100;
    const maxPerNode = opts.maxPerNode ?? 20;
    const root = await this.getNote(noteId);
    const rootNode: import("./types.js").SubtreeNode = { note: root, children: [] };
    const queue: import("./types.js").SubtreeNode[] = [rootNode];
    let visited = 1;
    while (queue.length && visited < maxNodes) {
      const node = queue.shift()!;
      const childIds = node.note.childNoteIds.slice(0, maxPerNode);
      const children = await Promise.all(childIds.map((id) => this.getNote(id)));
      for (const note of children) {
        if (visited >= maxNodes) break;
        const childNode: import("./types.js").SubtreeNode = { note, children: [] };
        node.children.push(childNode);
        queue.push(childNode);
        visited++;
      }
    }
    return rootNode;
  }

  async getNotePath(noteId: string): Promise<import("./types.js").Note[]> {
    const path: import("./types.js").Note[] = [];
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

  async getNoteAttributes(noteId: string): Promise<import("./types.js").Attribute[]> {
    const note = await this.getNote(noteId);
    return note.attributes;
  }

  async upsertAttribute(input: import("./types.js").CreateAttributeInput): Promise<import("./types.js").Attribute> {
    const note = await this.getNote(input.noteId);
    const existing = note.attributes.find((a) => a.type === input.type && a.name === input.name);
    if (existing) {
      // value/position patchable for labels; relations: only position. If type-side
      // fields differ (isInheritable), fall back to delete+create.
      const sameInheritable = input.isInheritable === undefined || input.isInheritable === existing.isInheritable;
      if (sameInheritable) {
        const patch: { value?: string; position?: number } = {};
        if (input.value !== undefined) patch.value = input.value;
        if (input.position !== undefined) patch.position = input.position;
        if (input.type === "label" && input.value !== undefined) return this.updateAttribute(existing.attributeId, patch);
        if (input.type === "relation" && input.position !== undefined) return this.updateAttribute(existing.attributeId, { position: input.position });
      }
      await this.deleteAttribute(existing.attributeId);
    }
    return this.createAttribute(input);
  }

  async moveNote(
    noteId: string,
    toParentNoteId: string,
    opts: { notePosition?: number; prefix?: string } = {},
  ): Promise<import("./types.js").Branch> {
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
```

(As in Task 7, convert the inline `import("./types.js").X` to top-level `import type` usages.)

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- tests/unit/etapi/client.test.ts`
Expected: PASS (all composite tests + earlier tests). `npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/etapi/client.ts tests/unit/etapi/client.test.ts
git commit -m "feat(etapi): composite methods (tree/subtree/path/append/attrs/upsert/move) (WF1)"
```

---

## Task 9: MCP server bootstrap

**Files:**
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `createClientFromEnv()` (`src/etapi/client.ts`), `registerAllTools(server, client)` (`src/tools/index.ts` — created in Task 14; this task creates a placeholder aggregator so the server boots with zero tools, then Task 14 fills it).
- Produces: a runnable `node dist/index.js` stdio MCP server named `trilium-mcp`.

- [ ] **Step 1: Create a minimal `src/tools/index.ts` placeholder** (Task 14 replaces the body)

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtapiClient } from "../etapi/client.js";

export function registerAllTools(_server: McpServer, _client: EtapiClient): void {
  // Tools registered in Tasks 10–13.
}
```

- [ ] **Step 2: Implement `src/index.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClientFromEnv } from "./etapi/client.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const client = createClientFromEnv();
  const server = new McpServer({ name: "trilium-mcp", version: "0.1.0" });
  registerAllTools(server, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("trilium-mcp failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Build and smoke-test the server starts (dies on missing env, runs on valid env)**

Run:
```bash
npm run build
# No env → should exit 1 with a clear message:
node dist/index.js < /dev/null || echo "exited as expected (missing env)"
# With env → process should stay alive waiting on stdio (kill after 1s):
( TRILIUM_URL=http://localhost:8080 TRILIUM_TOKEN=dummy timeout 1 node dist/index.js < /dev/null ) || true
```
Expected: first run prints a `TRILIUM_URL`/`TRILIUM_TOKEN` error and exits 1; second run starts without crashing (timeout kills it).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/tools/index.ts
git commit -m "feat(server): stdio MCP server bootstrap with env-driven client (WF1)"
```

---

## Task 10: Tools — read & search group

**Files:**
- Create: `src/tools/search.ts`, `src/tools/notes-read.ts`
- Create: `tests/helpers/mockClient.ts`
- Test: `tests/unit/tools/search.test.ts`, `tests/unit/tools/notes-read.test.ts`

**Interfaces:**
- Consumes: `EtapiClient` methods (Tasks 7–8), `asToolResult` (`src/lib/errors.ts`), `McpServer.registerTool`.
- Produces: MCP tools registered by `registerSearch(server, client)` and `registerRead(server, client)`. Tool names: `search_notes`, `get_note`, `get_note_content`, `get_note_tree`, `get_note_subtree`, `get_note_path`, `get_app_info`.

**Pattern (applies to all tool tasks 10–13):** each tool module exports (a) a plain `async` handler that takes parsed args + the client and returns a `CallToolResult` (testable without MCP), and (b) a `register…(server, client)` that wires it via `server.registerTool(name, {description, inputSchema: <zod raw shape>, annotations}, (args) => handler(args, client))`.

- [ ] **Step 1: Create mock client helper for tool unit tests**

`tests/helpers/mockClient.ts`:
```ts
import { vi } from "vitest";

// Returns a deeply-mocked EtapiClient: every method is a vi.fn(). Cast as needed.
export function mockClient(): any {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        // Memoize per property so test assertions can reference the same fn.
        const store = (globalThis as any).__mockStore ?? ((globalThis as any).__mockStore = {});
        return store[prop] ?? (store[prop] = vi.fn());
      },
    },
  );
}

export function resetMockStore(): void {
  (globalThis as any).__mockStore = undefined;
}
```

- [ ] **Step 2: Write failing test for `search_notes`**

`tests/unit/tools/search.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { searchNotesHandler } from "../../../src/tools/search.js";

beforeEach(resetMockStore);

describe("search_notes handler", () => {
  it("calls client.searchNotes and returns JSON text", async () => {
    const client = mockClient();
    client.searchNotes.mockResolvedValue([{ noteId: "a", title: "T" }]);
    const res = await searchNotesHandler({ query: "T", limit: 5 }, client);
    expect(client.searchNotes).toHaveBeenCalledWith({ search: "T", limit: 5 });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse((res.content[0] as { text: string }).text);
    expect(parsed[0].noteId).toBe("a");
  });

  it("surfaces EtapiError as isError", async () => {
    const { EtapiError } = await import("../../../src/lib/errors.js");
    const client = mockClient();
    client.searchNotes.mockRejectedValue(new EtapiError({ status: 400, code: "SEARCH_QUERY_PARAM_MANDATORY", message: "need q" }));
    const res = await searchNotesHandler({ query: "", limit: 5 }, client);
    expect(res.isError).toBe(true);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test -- tests/unit/tools/search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/tools/search.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "../lib/errors.js";
import { asToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function searchNotesHandler(
  args: { query: string; limit?: number; fastSearch?: boolean; orderBy?: string; orderDirection?: "asc" | "desc"; ancestorNoteId?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () =>
      client.searchNotes({
        search: args.query,
        limit: args.limit ?? 20,
        fastSearch: args.fastSearch,
        orderBy: args.orderBy,
        orderDirection: args.orderDirection,
        ancestorNoteId: args.ancestorNoteId,
      }),
    (notes) => JSON.stringify(notes),
  );
}

export function registerSearch(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "search_notes",
    {
      description:
        "Full-text search across Trilium notes (Trilium search syntax). Bare words are fulltext; use #label, #label=value, ~relation=target for structured filters. Returns note metadata (no bodies).",
      inputSchema: {
        query: z.string().min(1).describe("Trilium search expression"),
        limit: z.number().int().positive().max(500).optional().describe("Max results (default 20)"),
        fastSearch: z.boolean().optional().describe("Skip searching note content"),
        ancestorNoteId: z.string().optional().describe("Restrict to a subtree"),
        orderBy: z.string().optional().describe("Property or #labelName to order by"),
        orderDirection: z.enum(["asc", "desc"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => searchNotesHandler(args as Parameters<typeof searchNotesHandler>[0], client),
  );
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npm test -- tests/unit/tools/search.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `src/tools/notes-read.ts` (6 tools)**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "../lib/errors.js";
import { asToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const noteId = z.string().min(1).describe("Trilium note id");

export async function getNoteHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNote(args.noteId), (n) => JSON.stringify(n));
}
export async function getNoteContentHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteContent(args.noteId), (text) => text);
}
export async function getNoteTreeHandler(args: { noteId: string; limit?: number }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteTree(args.noteId, { limit: args.limit }), (kids) => JSON.stringify(kids));
}
export async function getNoteSubtreeHandler(args: { noteId: string; maxNodes?: number; maxPerNode?: number }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteSubtree(args.noteId, { maxNodes: args.maxNodes, maxPerNode: args.maxPerNode }), (t) => JSON.stringify(t));
}
export async function getNotePathHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNotePath(args.noteId), (path) => JSON.stringify(path.map((n) => ({ noteId: n.noteId, title: n.title }))));
}
export async function getAppInfoHandler(_args: Record<string, never>, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getAppInfo(), (info) => JSON.stringify(info));
}

export function registerRead(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_note", { description: "Get a single note's metadata (incl. attributes, parent/child ids).", inputSchema: { noteId }, annotations: { readOnlyHint: true } }, (a) => getNoteHandler(a as { noteId: string }, client));
  server.registerTool("get_note_content", { description: "Get the raw body of a note (HTML for text notes, source for code).", inputSchema: { noteId }, annotations: { readOnlyHint: true } }, (a) => getNoteContentHandler(a as { noteId: string }, client));
  server.registerTool("get_note_tree", { description: "List direct children of a note (metadata only).", inputSchema: { noteId, limit: z.number().int().positive().max(500).optional() }, annotations: { readOnlyHint: true } }, (a) => getNoteTreeHandler(a as { noteId: string; limit?: number }, client));
  server.registerTool("get_note_subtree", { description: "Recursively get a note's subtree as a tree (capped).", inputSchema: { noteId, maxNodes: z.number().int().positive().max(1000).optional(), maxPerNode: z.number().int().positive().max(100).optional() }, annotations: { readOnlyHint: true } }, (a) => getNoteSubtreeHandler(a as { noteId: string; maxNodes?: number; maxPerNode?: number }, client));
  server.registerTool("get_note_path", { description: "Get the ancestor chain from a note up to root.", inputSchema: { noteId }, annotations: { readOnlyHint: true } }, (a) => getNotePathHandler(a as { noteId: string }, client));
  server.registerTool("get_app_info", { description: "Get Trilium instance app info (version, liveness/credential check).", inputSchema: {}, annotations: { readOnlyHint: true } }, (a) => getAppInfoHandler(a as Record<string, never>, client));
}
```

- [ ] **Step 7: Write tests for one representative read tool + register shape**

`tests/unit/tools/notes-read.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { getNoteHandler, getAppInfoHandler } from "../../../src/tools/notes-read.js";

beforeEach(resetMockStore);

describe("get_note handler", () => {
  it("returns note JSON", async () => {
    const client = mockClient();
    client.getNote.mockResolvedValue({ noteId: "n1", title: "X" });
    const res = await getNoteHandler({ noteId: "n1" }, client);
    expect(client.getNote).toHaveBeenCalledWith("n1");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("n1");
  });
});

describe("get_app_info handler", () => {
  it("returns app info JSON", async () => {
    const client = mockClient();
    client.getAppInfo.mockResolvedValue({ appVersion: "0.50.2" });
    const res = await getAppInfoHandler({}, client);
    expect(JSON.parse((res.content[0] as { text: string }).text).appVersion).toBe("0.50.2");
  });
});
```

- [ ] **Step 8: Run tests, verify pass**

Run: `npm test -- tests/unit/tools/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/tools/search.ts src/tools/notes-read.ts tests/helpers/mockClient.ts tests/unit/tools/search.test.ts tests/unit/tools/notes-read.test.ts
git commit -m "feat(tools): read & search group (search_notes, get_note, content, tree, subtree, path, app_info) (WF1)"
```

---

## Task 11: Tools — write group

**Files:**
- Create: `src/tools/notes-write.ts`
- Test: `tests/unit/tools/notes-write.test.ts`

**Interfaces:**
- Produces: `registerWrite(server, client)` registering `create_note`, `update_note`, `update_note_content`, `append_to_note`, `delete_note`, `move_note`.

- [ ] **Step 1: Implement `src/tools/notes-write.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "../lib/errors.js";
import { asToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function createNoteHandler(
  args: { parentNoteId: string; title: string; type: "text" | "code" | "file" | "image" | "search" | "book" | "relationMap" | "render"; content: string; mime?: string; notePosition?: number; prefix?: string },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(() => client.createNote(args), (r) => JSON.stringify(r));
}
export async function updateNoteHandler(args: { noteId: string; title?: string; type?: string; mime?: string }, client: EtapiClient): Promise<CallToolResult> {
  const { noteId, ...patch } = args;
  return asToolResult(() => client.updateNote(noteId, patch as Parameters<typeof client.updateNote>[1]), (n) => JSON.stringify(n));
}
export async function updateNoteContentHandler(args: { noteId: string; content: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.updateNoteContent(args.noteId, args.content), () => `Updated content of ${args.noteId}`);
}
export async function appendToNoteHandler(args: { noteId: string; fragment: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.appendToNote(args.noteId, args.fragment), () => `Appended to ${args.noteId}`);
}
export async function deleteNoteHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteNote(args.noteId), () => `Deleted ${args.noteId}`);
}
export async function moveNoteHandler(args: { noteId: string; toParentNoteId: string; notePosition?: number; prefix?: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.moveNote(args.noteId, args.toParentNoteId, { notePosition: args.notePosition, prefix: args.prefix }), (b) => JSON.stringify(b));
}

export function registerWrite(server: McpServer, client: EtapiClient): void {
  server.registerTool("create_note", {
    description: "Create a new note under a parent. Returns {note, branch}.",
    inputSchema: {
      parentNoteId: z.string().describe("Parent note id"),
      title: z.string(),
      type: z.enum(["text", "code", "file", "image", "search", "book", "relationMap", "render"]),
      content: z.string().describe("Body (HTML for text notes)"),
      mime: z.string().optional().describe("Required for code/file/image"),
      notePosition: z.number().int().optional(),
      prefix: z.string().optional().describe("Branch title prefix"),
    },
  }, (a) => createNoteHandler(a as Parameters<typeof createNoteHandler>[0], client));

  server.registerTool("update_note", {
    description: "Update a note's metadata (title/type/mime).",
    inputSchema: { noteId: z.string(), title: z.string().optional(), type: z.string().optional(), mime: z.string().optional() },
  }, (a) => updateNoteHandler(a as Parameters<typeof updateNoteHandler>[0], client));

  server.registerTool("update_note_content", {
    description: "Replace a note's full body (full-replacement).",
    inputSchema: { noteId: z.string(), content: z.string() },
  }, (a) => updateNoteContentHandler(a as Parameters<typeof updateNoteContentHandler>[0], client));

  server.registerTool("append_to_note", {
    description: "Append a fragment to a note's body (read-modify-write; not atomic).",
    inputSchema: { noteId: z.string(), fragment: z.string() },
  }, (a) => appendToNoteHandler(a as Parameters<typeof appendToNoteHandler>[0], client));

  server.registerTool("delete_note", {
    description: "Delete a note (moves to trash; idempotent).",
    inputSchema: { noteId: z.string() },
  }, (a) => deleteNoteHandler(a as Parameters<typeof deleteNoteHandler>[0], client));

  server.registerTool("move_note", {
    description: "Move a note to a different parent (deletes old branch, creates new).",
    inputSchema: { noteId: z.string(), toParentNoteId: z.string(), notePosition: z.number().int().optional(), prefix: z.string().optional() },
  }, (a) => moveNoteHandler(a as Parameters<typeof moveNoteHandler>[0], client));
}
```

- [ ] **Step 2: Write tests**

`tests/unit/tools/notes-write.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { createNoteHandler, appendToNoteHandler, moveNoteHandler } from "../../../src/tools/notes-write.js";

beforeEach(resetMockStore);

describe("create_note handler", () => {
  it("creates and returns {note,branch}", async () => {
    const client = mockClient();
    client.createNote.mockResolvedValue({ note: { noteId: "n1" }, branch: { branchId: "b1" } });
    const res = await createNoteHandler({ parentNoteId: "root", title: "T", type: "text", content: "<p>x</p>" }, client);
    expect(client.createNote).toHaveBeenCalledWith({ parentNoteId: "root", title: "T", type: "text", content: "<p>x</p>" });
    expect(JSON.parse((res.content[0] as { text: string }).text).note.noteId).toBe("n1");
  });
});

describe("append_to_note handler", () => {
  it("appends and returns confirmation", async () => {
    const client = mockClient();
    client.appendToNote.mockResolvedValue(undefined);
    const res = await appendToNoteHandler({ noteId: "n1", fragment: "<p>y</p>" }, client);
    expect(client.appendToNote).toHaveBeenCalledWith("n1", "<p>y</p>");
    expect((res.content[0] as { text: string }).text).toContain("n1");
  });
});

describe("move_note handler", () => {
  it("delegates to client.moveNote", async () => {
    const client = mockClient();
    client.moveNote.mockResolvedValue({ branchId: "b2", parentNoteId: "p2" });
    const res = await moveNoteHandler({ noteId: "n1", toParentNoteId: "p2" }, client);
    expect(client.moveNote).toHaveBeenCalledWith("n1", "p2", { notePosition: undefined, prefix: undefined });
    expect(JSON.parse((res.content[0] as { text: string }).text).parentNoteId).toBe("p2");
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npm test -- tests/unit/tools/notes-write.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/notes-write.ts tests/unit/tools/notes-write.test.ts
git commit -m "feat(tools): write group (create/update/update_content/append/delete/move note) (WF1)"
```

---

## Task 12: Tools — attributes group

**Files:**
- Create: `src/tools/attributes.ts`
- Test: `tests/unit/tools/attributes.test.ts`

**Interfaces:**
- Produces: `registerAttributes(server, client)` registering `get_attributes`, `set_attribute`, `delete_attribute`.

- [ ] **Step 1: Implement `src/tools/attributes.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "../lib/errors.js";
import { asToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

export async function getAttributesHandler(args: { noteId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getNoteAttributes(args.noteId), (attrs) => JSON.stringify(attrs));
}
export async function setAttributeHandler(
  args: { noteId: string; type: "label" | "relation"; name: string; value?: string; isInheritable?: boolean },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => client.upsertAttribute({ noteId: args.noteId, type: args.type, name: args.name, value: args.value, isInheritable: args.isInheritable }),
    (a) => JSON.stringify(a),
  );
}
export async function deleteAttributeHandler(args: { attributeId: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.deleteAttribute(args.attributeId), () => `Deleted attribute ${args.attributeId}`);
}

export function registerAttributes(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_attributes", {
    description: "List a note's labels and relations (incl. inherited).",
    inputSchema: { noteId: z.string() },
    annotations: { readOnlyHint: true },
  }, (a) => getAttributesHandler(a as { noteId: string }, client));

  server.registerTool("set_attribute", {
    description: "Upsert a label or relation on a note. For relations, value is the target note id.",
    inputSchema: {
      noteId: z.string(),
      type: z.enum(["label", "relation"]),
      name: z.string().regex(/^[^\s]+$/, "no whitespace").describe("Attribute name (no spaces)"),
      value: z.string().optional().describe("Value (target noteId for relations)"),
      isInheritable: z.boolean().optional(),
    },
  }, (a) => setAttributeHandler(a as Parameters<typeof setAttributeHandler>[0], client));

  server.registerTool("delete_attribute", {
    description: "Delete an attribute by id (idempotent).",
    inputSchema: { attributeId: z.string() },
  }, (a) => deleteAttributeHandler(a as { attributeId: string }, client));
}
```

- [ ] **Step 2: Write tests**

`tests/unit/tools/attributes.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { getAttributesHandler, setAttributeHandler, deleteAttributeHandler } from "../../../src/tools/attributes.js";

beforeEach(resetMockStore);

describe("get_attributes handler", () => {
  it("returns attributes JSON", async () => {
    const client = mockClient();
    client.getNoteAttributes.mockResolvedValue([{ attributeId: "a1", name: "k" }]);
    const res = await getAttributesHandler({ noteId: "n1" }, client);
    expect(client.getNoteAttributes).toHaveBeenCalledWith("n1");
    expect(JSON.parse((res.content[0] as { text: string }).text)[0].attributeId).toBe("a1");
  });
});

describe("set_attribute handler", () => {
  it("upserts via client.upsertAttribute", async () => {
    const client = mockClient();
    client.upsertAttribute.mockResolvedValue({ attributeId: "a1", value: "v" });
    const res = await setAttributeHandler({ noteId: "n1", type: "label", name: "k", value: "v" }, client);
    expect(client.upsertAttribute).toHaveBeenCalledWith({ noteId: "n1", type: "label", name: "k", value: "v", isInheritable: undefined });
    expect(res.isError).toBeFalsy();
  });
});

describe("delete_attribute handler", () => {
  it("deletes and confirms", async () => {
    const client = mockClient();
    client.deleteAttribute.mockResolvedValue(undefined);
    const res = await deleteAttributeHandler({ attributeId: "a1" }, client);
    expect(client.deleteAttribute).toHaveBeenCalledWith("a1");
    expect((res.content[0] as { text: string }).text).toContain("a1");
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npm test -- tests/unit/tools/attributes.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/attributes.ts tests/unit/tools/attributes.test.ts
git commit -m "feat(tools): attributes group (get/set/delete_attribute) (WF1)"
```

---

## Task 13: Tools — calendar group

**Files:**
- Create: `src/tools/calendar.ts`
- Test: `tests/unit/tools/calendar.test.ts`

**Interfaces:**
- Produces: `registerCalendar(server, client)` registering `get_day_note`, `get_week_note`, `get_inbox_note`. `get_week_note` input is an ISO week string `YYYY-W##`.

- [ ] **Step 1: Implement `src/tools/calendar.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "../lib/errors.js";
import { asToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const isoWeek = z.string().regex(/^\d{4}-W\d{2}$/, "YYYY-W## (ISO week)");

export async function getDayNoteHandler(args: { date: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getDayNote(args.date), (n) => JSON.stringify(n));
}
export async function getWeekNoteHandler(args: { week: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getWeekNote(args.week), (n) => JSON.stringify(n));
}
export async function getInboxNoteHandler(args: { date: string }, client: EtapiClient): Promise<CallToolResult> {
  return asToolResult(() => client.getInboxNote(args.date), (n) => JSON.stringify(n));
}

export function registerCalendar(server: McpServer, client: EtapiClient): void {
  server.registerTool("get_day_note", { description: "Get (auto-create) the day note for YYYY-MM-DD.", inputSchema: { date: ymd }, annotations: { readOnlyHint: true } }, (a) => getDayNoteHandler(a as { date: string }, client));
  server.registerTool("get_week_note", { description: "Get the week note for an ISO week (YYYY-W##). Returns WEEK_NOT_FOUND if week notes are disabled.", inputSchema: { week: isoWeek }, annotations: { readOnlyHint: true } }, (a) => getWeekNoteHandler(a as { week: string }, client));
  server.registerTool("get_inbox_note", { description: "Get the inbox note for YYYY-MM-DD (a #inbox note if one exists, else the day note).", inputSchema: { date: ymd }, annotations: { readOnlyHint: true } }, (a) => getInboxNoteHandler(a as { date: string }, client));
}
```

- [ ] **Step 2: Write tests**

`tests/unit/tools/calendar.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient, resetMockStore } from "../../helpers/mockClient.js";
import { getDayNoteHandler, getWeekNoteHandler, getInboxNoteHandler } from "../../../src/tools/calendar.js";

beforeEach(resetMockStore);

describe("calendar handlers", () => {
  it("get_day_note delegates", async () => {
    const client = mockClient();
    client.getDayNote.mockResolvedValue({ noteId: "d1" });
    const res = await getDayNoteHandler({ date: "2026-07-12" }, client);
    expect(client.getDayNote).toHaveBeenCalledWith("2026-07-12");
    expect(JSON.parse((res.content[0] as { text: string }).text).noteId).toBe("d1");
  });
  it("get_week_note delegates with ISO week", async () => {
    const client = mockClient();
    client.getWeekNote.mockResolvedValue({ noteId: "w1" });
    await getWeekNoteHandler({ week: "2026-W28" }, client);
    expect(client.getWeekNote).toHaveBeenCalledWith("2026-W28");
  });
  it("get_inbox_note delegates", async () => {
    const client = mockClient();
    client.getInboxNote.mockResolvedValue({ noteId: "in1" });
    await getInboxNoteHandler({ date: "2026-07-12" }, client);
    expect(client.getInboxNote).toHaveBeenCalledWith("2026-07-12");
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npm test -- tests/unit/tools/calendar.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/calendar.ts tests/unit/tools/calendar.test.ts
git commit -m "feat(tools): calendar group (day/week/inbox note) (WF1)"
```

---

## Task 14: Tool aggregation + .mcp.json + minimal README update

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `README.md` (registration snippet)
- Create: `.mcp.json`

**Interfaces:**
- Produces: `registerAllTools` wires all 5 groups. A 19-tool surface (7 read/search + 6 write + 3 attributes + 3 calendar = 19 tools — note `get_app_info` is in the read group). `.mcp.json` registers the server via `npx`/local with env, no absolute paths.

- [ ] **Step 1: Rewrite `src/tools/index.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtapiClient } from "../etapi/client.js";
import { registerSearch } from "./search.js";
import { registerRead } from "./notes-read.js";
import { registerWrite } from "./notes-write.js";
import { registerAttributes } from "./attributes.js";
import { registerCalendar } from "./calendar.js";

export function registerAllTools(server: McpServer, client: EtapiClient): void {
  registerSearch(server, client);
  registerRead(server, client);
  registerWrite(server, client);
  registerAttributes(server, client);
  registerCalendar(server, client);
}
```

- [ ] **Step 2: Add an aggregation test that lists tools via `InMemoryTransport`**

`tests/unit/tools/index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../../../src/tools/index.js";

const EXPECTED = [
  "search_notes", "get_note", "get_note_content", "get_note_tree", "get_note_subtree",
  "get_note_path", "get_app_info", "create_note", "update_note", "update_note_content",
  "append_to_note", "delete_note", "move_note", "get_attributes", "set_attribute",
  "delete_attribute", "get_day_note", "get_week_note", "get_inbox_note",
];

describe("registerAllTools", () => {
  it("registers all expected tools", async () => {
    const server = new McpServer({ name: "t", version: "0" });
    registerAllTools(server, {} as any);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED].sort());
    await client.close();
    await server.close();
  });
});
```

- [ ] **Step 3: Run all unit tests + build**

Run:
```bash
npm test
npm run build
npm run lint
```
Expected: all unit tests green (incl. the 19-tool aggregation test); build clean; lint clean.

- [ ] **Step 4: Create `.mcp.json`**

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-llm-wiki-mcp"],
      "env": {
        "TRILIUM_URL": "http://localhost:8080",
        "TRILIUM_TOKEN": "${TRILIUM_TOKEN}"
      }
    }
  }
}
```

> For local dev use `"command": "node", "args": ["dist/index.js"]` instead of npx.

- [ ] **Step 5: Update `README.md` registration section**

Append after the Develop section:
```markdown
## Register in Claude Code (local dev)
```bash
claude mcp add --scope user trilium \
  --env TRILIUM_URL=http://localhost:8080 \
  --env TRILIUM_TOKEN=<etapi-token> \
  -- node dist/index.js
```
A project-scope `.mcp.json` is included for env-driven registration.
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/index.ts tests/unit/tools/index.test.ts .mcp.json README.md
git commit -m "feat(tools): aggregate 19 tools + .mcp.json + README registration (WF1)"
```

---

## Task 15: Integration tests against live Trilium

**Files:**
- Create: `tests/helpers/integration.ts`, `tests/integration/notes.integration.test.ts`, `tests/integration/attributes.integration.test.ts`, `tests/integration/branches-move.integration.test.ts`, `tests/integration/calendar.integration.test.ts`

**Interfaces:**
- Consumes: live `EtapiClient` built from env. Fixture root note `__mcp_test_root__` under `root`, created in `beforeAll`, deleted (subtree) in `afterAll`.
- Produces: `npm run test:integration` passes against the Docker Trilium, exercising each tool's happy path end-to-end. Skipped automatically when `TRILIUM_TOKEN` is unset.

- [ ] **Step 1: Create `tests/helpers/integration.ts`**

```ts
import { createClientFromEnv, EtapiClient } from "../../src/etapi/client.js";
import { loadConfig } from "../../src/lib/config.js";

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
  const r = await client.createNote({ parentNoteId: "root", title: TEST_ROOT_TITLE, type: "text", content: "" });
  return r.note.noteId;
}

export async function cleanupTestRoot(client: EtapiClient, noteId: string): Promise<void> {
  await client.deleteNote(noteId);
}
```

- [ ] **Step 2: Create `tests/integration/notes.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient, ensureTestRoot, cleanupTestRoot, TEST_ROOT_TITLE } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("notes (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("creates, reads, updates, appends, deletes a note", async () => {
    const created = await client.createNote({ parentNoteId: rootId, title: "it-note", type: "text", content: "<p>hello</p>" });
    const id = created.note.noteId;

    const note = await client.getNote(id);
    expect(note.title).toBe("it-note");

    await client.updateNote(id, { title: "it-note-renamed" });
    expect((await client.getNote(id)).title).toBe("it-note-renamed");

    expect(await client.getNoteContent(id)).toContain("hello");

    await client.appendToNote(id, "<p>world</p>");
    expect(await client.getNoteContent(id)).toContain("world");

    // tree: this note is a child of root; subtree: root contains it
    const tree = await client.getNoteTree(rootId);
    expect(tree.some((n) => n.noteId === id)).toBe(true);

    const subtree = await client.getNoteSubtree(rootId, { maxNodes: 50 });
    const flat = JSON.stringify(subtree);
    expect(flat).toContain(id);

    const path = await client.getNotePath(id);
    expect(path.some((n) => n.noteId === rootId)).toBe(true);

    await client.deleteNote(id);
    await expect(client.getNote(id)).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
  });

  it("get_app_info returns version", async () => {
    const info = await client.getAppInfo();
    expect(typeof info.appVersion).toBe("string");
    expect(info.appVersion.length).toBeGreaterThan(0);
  });

  it("search_notes finds the test root", async () => {
    const results = await client.searchNotes({ search: TEST_ROOT_TITLE });
    expect(results.some((n) => n.title === TEST_ROOT_TITLE)).toBe(true);
  });
});
```

- [ ] **Step 3: Create `tests/integration/attributes.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient, ensureTestRoot, cleanupTestRoot } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("attributes (integration)", () => {
  let client: EtapiClient;
  let rootId: string;
  let noteId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
    const r = await client.createNote({ parentNoteId: rootId, title: "attr-note", type: "text", content: "" });
    noteId = r.note.noteId;
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("upsert (create then update) and read attributes", async () => {
    const created = await client.upsertAttribute({ noteId, type: "label", name: "status", value: "weak" });
    expect(created.value).toBe("weak");

    const updated = await client.upsertAttribute({ noteId, type: "label", name: "status", value: "strong" });
    expect(updated.value).toBe("strong");

    const attrs = await client.getNoteAttributes(noteId);
    const status = attrs.find((a) => a.name === "status");
    expect(status?.value).toBe("strong");
    expect(attrs.filter((a) => a.name === "status")).toHaveLength(1); // upsert did not duplicate

    await client.deleteAttribute(updated.attributeId);
    const after = await client.getNoteAttributes(noteId);
    expect(after.some((a) => a.name === "status")).toBe(false);
  });
});
```

- [ ] **Step 4: Create `tests/integration/branches-move.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import { integrationEnabled, liveClient, ensureTestRoot, cleanupTestRoot } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("branches & move (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("clones a note via createBranch, then moves it", async () => {
    const folderA = (await client.createNote({ parentNoteId: rootId, title: "A", type: "book", content: "" })).note.noteId;
    const folderB = (await client.createNote({ parentNoteId: rootId, title: "B", type: "book", content: "" })).note.noteId;
    const leaf = (await client.createNote({ parentNoteId: folderA, title: "leaf", type: "text", content: "" })).note.noteId;

    // clone leaf under B
    const cloneBranch = await client.createBranch({ noteId: leaf, parentNoteId: folderB });
    const afterClone = await client.getNote(leaf);
    expect(afterClone.parentNoteIds.sort()).toEqual([folderA, folderB].sort());

    // move leaf to B only
    await client.moveNote(leaf, folderB);
    const afterMove = await client.getNote(leaf);
    expect(afterMove.parentNoteIds).toEqual([folderB]);
    expect(cloneBranch.branchId).toBeTruthy();
  });
});
```

- [ ] **Step 5: Create `tests/integration/calendar.integration.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { integrationEnabled, liveClient } from "../helpers/integration.js";

const enabled = integrationEnabled();
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("calendar (integration)", () => {
  it("gets a day note (auto-created)", async () => {
    const client = liveClient();
    const n = await client.getDayNote("2026-07-12");
    expect(n.noteId).toBeTruthy();
  });
  it("gets the inbox note", async () => {
    const client = liveClient();
    const n = await client.getInboxNote("2026-07-12");
    expect(n.noteId).toBeTruthy();
  });
  it("gets a week note (ISO week) or WEEK_NOT_FOUND", async () => {
    const client = liveClient();
    try {
      const n = await client.getWeekNote("2026-W28");
      expect(n.noteId).toBeTruthy();
    } catch (e) {
      // Week notes may be disabled in the test instance.
      expect((e as { code?: string }).code).toBe("WEEK_NOT_FOUND");
    }
  });
});
```

- [ ] **Step 6: Run integration tests against the live Trilium**

Prereq: Trilium is up (`docker compose ps`) and `.env` has `TRILIUM_URL`/`TRILIUM_TOKEN`.
Run:
```bash
npm run build
npm run test:integration
```
Expected: all integration tests green (week-note test tolerates `WEEK_NOT_FOUND`). If `TRILIUM_TOKEN` is unset, suites skip.

- [ ] **Step 7: Commit**

```bash
git add tests/helpers/integration.ts tests/integration/
git commit -m "test: integration suite against live Trilium (notes/attributes/branches/calendar) (WF1)"
```

---

## Self-Review (author's pre-handoff check)

**1. Spec coverage (WF0+WF1 scope only — later rounds cover the rest):**
- §4.1 architecture (ETAPI client / MCP tools / transport / config via env / pagination surface): Tasks 3, 6, 9, 14. ✓
- §3.1 18 reference tools (clean-room equivalents): `search_notes` (T10), `get_note`/`get_note_content`/`get_note_tree`/`get_note_subtree`/`get_note_path`/`get_app_info` (T10), `create_note`/`update_note`/`update_note_content`/`append_to_note`/`delete_note`/`move_note` (T11), `get_attributes`/`set_attribute`/`delete_attribute` (T12), `get_day_note`/`get_week_note`/`get_inbox_note` (T13). ✓ — 19 tools (read group adds `get_note_content`/`get_note_subtree` which §3.1 lists).
- §6.1 Docker TriliumNext + ETAPI token: Task 2. ✓
- §6.2 unit (mocked) + integration (live) tests: Tasks 3–15. ✓
- §4.4 `.mcp.json` env-driven + LICENSE/NOTICE: Tasks 1, 14. ✓
- §4.5 npx/no-abs-paths: `.mcp.json` uses `npx`; bin is `trilium-mcp`. ✓
- WF0 DoD (`docker compose up -d` works, token in `.env`, `npm test` green): Tasks 1, 2. ✓
- WF1 DoD (core MCP + 18 tools tested): Tasks 6–15. ✓

**2. Placeholder scan:** No TBD/TODO. Composite-method edge cases (relation-only upsert, multi-parent path) are explicit in code comments, not hand-waved.

**3. Type consistency:** `EtapiClient` method names are identical in client tests, handler tests, and registration calls (`searchNotes`, `getNoteTree`, `upsertAttribute`, `moveNote`, `appendToNote`, …). Handler arg shapes match the zod `inputSchema` fields and the `as Parameters<typeof …>[0]` casts. Tool names match the `EXPECTED` list in Task 14.

**Gaps intentionally deferred to later rounds (out of WF0+WF1 scope):** revisions, attachments, export/import, history/undelete, system tools, and all composite wiki-tools (`upsert_note`, `get_backlinks`, `find_related`, `query_wiki`, …) — those are WF2. Companion CLI, SKILL.md, hooks, E2E, full README — WF3–WF7.

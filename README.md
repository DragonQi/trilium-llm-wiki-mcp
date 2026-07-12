# trilium-llm-wiki-mcp

An [MCP](https://modelcontextprotocol.io) server + LLM-wiki skill that turns
[Trilium / TriliumNext Notes](https://github.com/TriliumNext/Notes) into the
single backend for a personal **LLM-wiki** (the [Karpathy methodology](https://github.com/karpathy/llm-wiki)):
ingest sources, query accumulated knowledge, lint for drift — with Trilium as
the typed-graph store and search engine.

> **MCP = the hands** (52 tools). **The skill = the brain** (when/how to use them). **Trilium = the backend** (notes = pages, relations = typed graph, labels = queryable metadata, built-in search = the "map").

Clean-room, MIT, ESM TypeScript. 52 MCP tools, a companion CLI, a SKILL, and
SessionStart/Stop hooks — all tested against a live Docker Trilium.

---

## Quickstart

You need Docker (or an existing Trilium) and Node ≥ 18.

```bash
# 1) Run a local TriliumNext (one-time first-run init in the browser)
docker compose up -d
open http://localhost:8080            # choose "new user", set a password

# 2) Put connection details in .env
cp .env.example .env
# edit .env: TRILIUM_URL=http://localhost:8080, TRILIUM_PASSWORD=<your password>

# 3) Get an ETAPI token into .env
node scripts/get-etapi-token.mjs --write   # reads TRILIUM_PASSWORD, writes TRILIUM_TOKEN

# 4) Register the MCP server in Claude Code + merge the wiki hooks
npx -y -p trilium-llm-wiki-mcp trilium-wiki install

# 5) Seed the LLM Wiki vault in Trilium
npx -y -p trilium-llm-wiki-mcp trilium-wiki init

# 6) Verify
npx -y -p trilium-llm-wiki-mcp trilium-wiki doctor
```

That's it — start a Claude Code session, ask it to "add this to my wiki", and
the `trilium-wiki` skill takes over.

---

## Two binaries

| Bin | Role |
|---|---|
| `trilium-llm-wiki-mcp` / `trilium-mcp` | stdio MCP server — the agent's **hands** (52 tools: notes, attributes/relations, graph relevance `find_related`, retrieval pipeline `query_wiki`, attachments, export/import, calendar, system, …). |
| `trilium-wiki` | companion CLI — automation **outside** MCP (hooks fire when MCP isn't connected): `init`, `brief`, `checkpoint`, `doctor`, `install`. |

> **npx note:** the package ships multiple bins, so be explicit —
> MCP server: `npx -y trilium-llm-wiki-mcp` (default bin);
> CLI: `npx -y -p trilium-llm-wiki-mcp trilium-wiki <cmd>` (the `-p` selects the CLI bin).
> Or install globally: `npm i -g trilium-llm-wiki-mcp` → `trilium-mcp` / `trilium-wiki` on PATH.

## Register the MCP server

User scope (works everywhere):

```bash
claude mcp add --scope user trilium \
  --env TRILIUM_URL=http://localhost:8080 \
  --env TRILIUM_TOKEN=<etapi-token> \
  -- npx -y trilium-llm-wiki-mcp
```

Or project scope — a ready `.mcp.json` is included (env-driven, no absolute
paths). Local dev without npx: `-- node dist/index.js`.

## Hooks (SessionStart / Stop)

`trilium-wiki install` non-destructively merges two hooks into
`~/.claude/settings.json`:

- **SessionStart** → `trilium-wiki brief` — injects a wiki brief (Index excerpt,
  recent Log, weak/orphan/query counts) as session context.
- **Stop** → `trilium-wiki checkpoint` — appends a `## [date] session | end`
  marker to the Log.

Idempotent (re-running won't duplicate entries) and preserves any unrelated
hooks. Verify: `trilium-wiki brief` / `trilium-wiki doctor`.

## Multi-PC (one wiki, many machines)

Two supported topologies (spec §6.1):

1. **Local Trilium + sync (recommended, offline-capable).** Each PC runs its own
   `docker compose up -d` and points `TRILIUM_URL` at `localhost`. Designate one
   always-on machine as the **sync server** (Trilium UI → *Sync → Server
   hostname*); the others sync to it. Every PC works locally and replicates.
2. **Central server.** One shared Trilium on a home server/VPS/tunnel; every PC
   sets `TRILIUM_URL` to it (no local instance). Simpler, but needs online.

`docker-compose.yml`, `.mcp.json`, the skill, and the hook commands use only
`npx`/`~` and env vars — no PC-specific paths — so the same setup applies on
every machine. Dotfiles-friendly: keep `~/.trilium-wiki.env`, the skill, and the
hooks block in your config repo and run `trilium-wiki install` on each PC.

---

## Architecture

```
                   ┌───────────────────────────┐
   Claude Code ───▶│ trilium-mcp (MCP/stdio)   │──┐  ETAPI
   (the agent)     │ 52 tools over EtapiClient │  │  HTTP
                   └───────────────────────────┘  ▼
   SessionStart ──▶┌───────────────────────────┐  ┌──────────────┐
   Stop ──────────▶│ trilium-wiki (CLI)        │─▶│ TriliumNext  │
                   │ init/brief/checkpoint/... │  │ (Docker 8080)│
                   └───────────────────────────┘  └──────────────┘
   skill: SKILL.md ─ ingest/query/lint/delete procedures (the "brain")
```

- **`src/etapi/client.ts`** — the single ETAPI client (engine + direct +
  composite methods). Used by both `trilium-mcp` and `trilium-wiki`.
- **`src/tools/*.ts`** — 52 thin MCP tools (handler + `register…`).
- **`src/graph/`** — relevance model (`find_related`, 4-signal) + retrieval
  pipeline (`query_wiki`), over `graphology`.
- **`src/cli/`** — the `trilium-wiki` companion CLI.
- **`skill/SKILL.md`** — the wiki methodology (frontmatter + ingest/query/lint/delete).

## Development

```bash
npm install
npm run build
npm test                  # unit (mocked ETAPI)
npm run test:integration  # vs live Trilium (needs TRILIUM_URL/TRILIUM_TOKEN)
npm run lint
```

163 tests (127 unit + 36 integration) cover every tool, the graph core, the CLI,
and a full ingest→query→lint→delete methodology cycle.

## Tool reference (52)

Notes (read/search/write/tree/subtree/path/append/move) · attributes (get/set/
add/delete/upsert + extras) · branches/clone · attachments (7) · export/import ·
revisions (snapshot) · calendar (day/week/month/year/inbox) · system (login/
logout/backup/metrics) · composite (`upsert_note`, `get_backlinks`, `find_orphans`,
`search_by_attribute`, `replace_note_section`, `bulk_set_attributes`) · graph
(`find_related`, `query_wiki`).

## Limitations (ETAPI)

TriliumNext's ETAPI exposes no: revision listing/reading, note undelete, recent-
changes history, or protected-note content. The corresponding tools are omitted
(documented as non-goals); protected notes surface a clear `NOTE_IS_PROTECTED`.

## License & attribution

MIT © DragonQi. Clean-room implementation of the public LLM-wiki methodology by
Andrej Karpathy (no source from the gist is included). ETAPI access targets
Trilium/TriliumNext Notes; this project is independent and not affiliated. See
`NOTICE`.

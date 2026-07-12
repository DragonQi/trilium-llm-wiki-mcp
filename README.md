# trilium-llm-wiki-mcp

MCP server exposing Trilium/TriliumNext Notes via ETAPI, plus an LLM-wiki
skill (Karpathy methodology) where Trilium is the single wiki backend.

**Status:** WF0–WF5 done — MCP server (51 tools), companion CLI `trilium-wiki`,
`SKILL.md`, and SessionStart/Stop hooks. Remaining: E2E methodology test (WF6)
and full quickstart/multi-PC/npm publish (WF7).

## Develop

```bash
npm install
npm run build
npm test                 # unit (mocked ETAPI)
npm run test:integration # vs a live Trilium (needs TRILIUM_URL/TRILIUM_TOKEN)
```

## Two binaries

| Bin | Role |
|---|---|
| `trilium-mcp` | stdio MCP server — the agent's "hands" (51 tools) |
| `trilium-wiki` | companion CLI — automation outside MCP: `init`, `brief`, `checkpoint`, `doctor`, `install` |

## Register the MCP server (local dev)

```bash
claude mcp add --scope user trilium \
  --env TRILIUM_URL=http://localhost:8080 \
  --env TRILIUM_TOKEN=<etapi-token> \
  -- node dist/index.js
```

A project-scope `.mcp.json` is included for env-driven registration.

## Hooks (SessionStart / Stop)

`trilium-wiki install` non-destructively merges two hooks into `~/.claude/settings.json`:

- **SessionStart** → `trilium-wiki brief` — injects a wiki brief (Index excerpt, recent Log, weak/orphan/query counts) as session context, so every session starts aware of the wiki.
- **Stop** → `trilium-wiki checkpoint` — appends a `## [date] session | end` marker to the Log with weak/orphan counts.

The merged block looks like:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "npx -y -p trilium-llm-wiki-mcp trilium-wiki brief" }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "npx -y -p trilium-llm-wiki-mcp trilium-wiki checkpoint" }] }
    ]
  }
}
```

`install` is idempotent (re-running won't duplicate hook entries) and preserves any unrelated hooks you already have.

### Verify the hooks

```bash
npm run build
trilium-wiki doctor        # Trilium reachable + vault present?
trilium-wiki brief         # preview exactly what SessionStart injects
trilium-wiki checkpoint    # preview exactly what Stop runs
```

Then start a Claude Code session in this project — the SessionStart hook fires and the brief appears in context. (The hook command is exercised end-to-end by `tests/integration/hooks.integration.test.ts`.)

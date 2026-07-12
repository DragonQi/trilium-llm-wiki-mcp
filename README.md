# trilium-llm-wiki-mcp

MCP server exposing Trilium/TriliumNext Notes via ETAPI, plus an LLM-wiki
skill (Karpathy methodology) where Trilium is the single wiki backend.

Status: WF0+WF1 (core MCP + base tools). Full quickstart arrives in a later phase.

## Develop

```bash
npm install
npm run build
npm test
```

## Register in Claude Code (local dev)

```bash
claude mcp add --scope user trilium \
  --env TRILIUM_URL=http://localhost:8080 \
  --env TRILIUM_TOKEN=<etapi-token> \
  -- node dist/index.js
```

A project-scope `.mcp.json` is included for env-driven registration.

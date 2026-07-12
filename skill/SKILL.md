---
name: trilium-wiki
description: Use when working with the user's personal LLM-wiki in Trilium — ingesting a source into the wiki, answering a knowledge question from accumulated pages, linting the wiki for drift/contradictions, or deleting a source. Trigger ONLY on explicit references like "my wiki", "LLM Wiki", "база знаний", or the Trilium wiki; do NOT trigger for generic note search, Obsidian, or Notion. When unsure whether the user means the wiki, ask before calling any Trilium tool.
---

# Trilium LLM-Wiki

## Overview

A personal knowledge wiki where **Trilium is the single backend** and you (the agent) own the wiki layer. Raw sources are immutable truth; wiki pages are your generated synthesis. **Drift** — outdated, contradictory, orphaned pages — is the enemy; lint is mandatory, not optional.

- **MCP tools are your hands** — 52 tools via the `trilium` MCP server (search, read/write notes, attributes/relations, graph relevance `find_related`, retrieval pipeline `query_wiki`, attachments, export, calendar, system).
- **This skill is your brain** — *when* and *how* to use them.
- The companion CLI `trilium-wiki` (init/brief/checkpoint) handles automation outside the MCP transport.

## When to use

- **Ingest** — user says "add this to my wiki" / "ingest" / drops a source URL or text.
- **Query** — user asks a question answerable from accumulated wiki knowledge.
- **Lint** — user says "lint my wiki" / "health check", or periodically.
- **Delete** — user says "remove this source from my wiki".

**Trigger discipline:** trigger ONLY on explicit wiki references ("my wiki", "LLM Wiki", "база знаний"). Do NOT trigger on "search my notes", "check Obsidian", "Notion" — those have their own tools. **When unsure — ask the user**, do not call Trilium tools blind.

## Vault map (the "map" — read first, bodies later)

```
LLM Wiki/
  Purpose      # why this wiki exists — read FIRST on every ingest + query
  Raw/         # immutable sources (#wikiLayer=raw, #contentHash)
  Wiki/{Summaries, Concepts, Entities, Queries, Comparisons, Overview, Synthesis}/
  Review/      # async human-in-the-loop queue
  Index        # one line per page (link — summary — #status) — the navigation map
  Log          # append-only: ## [YYYY-MM-DD] op | title
```

Container `#wikiLayer` labels are **inheritable**, so a note created under `Concepts/` automatically gets `#wikiLayer=concept`.

## Conventions (labels = queryable metadata; relations = typed graph)

- `#status = weak | moderate | strong` — confidence. **Required on every content page.**
- `#updated = YYYY-MM-DD`, `#sources = N` (justification count), `#contentHash = <sha256>` (on Raw — incremental re-ingest cache).
- `#orphanCandidate = true` — set by lint.
- `#reviewType = contradiction | duplicate | missing-page | confirm | suggestion` on Review items.
- Relations (strictly richer than `[[wikilinks]]` — directed, typed, queryable): `derivedFrom` (page → Raw source; the citation backbone), `relatesTo`, `supersedes`, `contradicts`, `mentions`/`about`, `partOf`.

## The four operations

| Op | When | Detail |
|---|---|---|
| **INGEST** | add a source | [references/ingest.md](references/ingest.md) — two-step CoT, ~10–15 pages per source |
| **QUERY** | answer from wiki | [references/query.md](references/query.md) — Index → `query_wiki` → synthesize → file |
| **LINT** | drift check | [references/lint.md](references/lint.md) — 7 checks → Review queue |
| **DELETE** | remove a source | [references/delete.md](references/delete.md) — cascade cleanup |

## Hard rules (non-negotiable)

1. **Map, not bodies.** Never read all page bodies to search. Route: `Index` → `search_by_attribute`/`search_notes` (narrow label filter) → pick ~10 noteIds → `get_note_content` only those.
2. **Search before create.** Always `upsert_note` / `search_by_attribute` before creating — never duplicate.
3. **`#status` is required** on every content page. No exceptions.
4. **Every claim cites its source** via a `derivedFrom` relation to the Raw note.
5. **Index + Log + Overview update in the same pass** as ingest — never "I'll do it later".
6. **Drift is the #1 enemy.** Lint is mandatory; the main failure-mode is under-updating cross-refs during ingest.
7. **Lint never deletes alone** and never creates content pages — it only raises Review items.
8. **New page vs edit:** create a new page when it's a distinct entity/concept you'll reference from elsewhere; edit in place when it's an attribute/update of an existing one.

## Quick reference — tools per operation

- **Ingest:** `upsert_note`, `set_attribute`, `get_attributes`, `replace_note_section`, `find_related`, `append_to_note` (Log), `create_note` (Raw/Review)
- **Query:** `query_wiki`, `find_related`, `get_note_content`, `search_by_attribute`, `get_note_path`
- **Lint:** `search_by_attribute`, `find_orphans`, `get_backlinks`, `find_related`, `create_note` (Review items only)
- **Delete:** `search_notes`, `get_attributes`, `delete_note`, `set_attribute`, `delete_attribute`
- **All ops:** `get_app_info` (liveness check), `search_notes`

# INGEST — add a source to the wiki

One source → ~10–15 pages (summary + entity/concept pages + overview/index/log updates + review items). Two-step Chain-of-Thought: **Analysis** first, then **Generation**.

## Pre-check (incremental cache)

1. Compute `#contentHash` (SHA-256) of the source text.
2. `search_by_attribute` for an existing Raw note with that `#contentHash`.
3. If found **and** all its `derivedFrom` pages exist → **skip** (already ingested). Stop.

## Step 1 — Analysis (separate reasoning pass)

Read the source + the vault `Purpose` + `Index`. Think, then list:
- Key **entities** (people/orgs/places/products/events).
- Key **concepts** (cross-source ideas).
- Main **arguments/claims** with their evidence.
- **Connections** to existing wiki pages (what does this reinforce / extend?).
- **Contradictions** with what the wiki already says.
- Structural recommendation (which entities/concepts are new pages vs. edits).

Do not write any pages yet — this pass only produces the analysis you'll generate from.

## Step 2 — Generation

For each item below, **search before create** (`upsert_note` / `search_by_attribute`) to avoid duplicates:

1. **Raw note** under `Raw/`: `#wikiLayer=raw #contentHash=<sha> #ingested=<today> #wikiType=<article|paper|video|...>`. Body = the source (immutable).
2. **Summary** under `Wiki/Summaries/`: `#wikiLayer=summary #status=<weak|moderate|strong> #sources=1 #updated=<today>`. Add `derivedFrom` → Raw. Body = your structured summary.
3. **Entities & concepts** under `Wiki/Entities/` and `Wiki/Concepts/`: for each, **first search** (`upsert_note`) → create new **or** update existing (merge via `replace_note_section`; bump `#sources` and `#updated`). Add `derivedFrom` → Raw. Set `#wikiType` (entity: `person|org|place|product|event`; concept: domain type).
4. **Relations**: `relatesTo` between connected pages; `partOf` for entity→grouping; `mentions`/`about` backrefs.
5. **Overview**: always regenerate the `Wiki/Overview/` note — it's the evolving thesis.
6. **Index**: append one line per new/updated page (`link — one-line summary — #status`).
7. **Log**: `append_to_note` the Log with `## [<today>] ingest | <source title>`.
8. **Review items** under `Review/`: for each contradiction/missing-page/duplicate/suggestion, `create_note` with `#reviewType=<...> #reviewResolved=false #reviewAction=<create-page|deep-research|skip>` and a pre-generated search query (for later Deep Research).

## Contradiction protocol

On detecting a contradiction:
1. Note it on the concept/entity page.
2. Create/update a `Wiki/Queries/` page capturing the open question.
3. Add `contradicts` (and `supersedes` if one supersedes the other) relations on **both** sources.
4. Resolution happens later in a `Wiki/Synthesis/` page — not during ingest.

## Hard rules (recap)

- Always search before create (anti-duplicate).
- Every claim cites Raw via `derivedFrom`.
- `#status` required on every content page.
- Index + Log + Overview update **in this pass**.
- Map-not-bodies: use `find_related` to find affected pages, don't scan everything.

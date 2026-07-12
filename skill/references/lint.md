# LINT — health-check the wiki for drift

Run on demand or periodically. Output is a **lint report** + **Review items** — async, human-in-the-loop. **Lint never deletes anything by itself and never creates content pages.**

## Checks

1. **Schema integrity** — `search_by_attribute` for content pages (`#wikiLayer=summary|concept|entity|synthesis|overview`) missing required labels (`#status` / `#updated` / `#sources`). Flag each.
2. **Staleness** — order content pages by `#updated` asc; take the top 5–10 oldest. Check if any are `superseded` by newer pages.
3. **Coverage gaps** — scan recent summaries for entity/concept mentions that have no page. Raise `#reviewType=missing-page` Review items (with a pre-generated search query).
4. **Overview drift** — compare `#updated` on the Overview vs. the newest summary. If Overview is older, it's drifted — flag for regeneration.
5. **Orphans** — `find_orphans` (and/or `get_backlinks`) for pages with zero incoming relations. Set `#orphanCandidate=true` and raise a Review item.
6. **Duplicates** — near-identical titles under the same layer. Raise `#reviewType=duplicate`.
7. **Contradictions** — walk `contradicts`/`supersedes` relations; list unresolved ones (no `Wiki/Synthesis/` resolution).

## Output

- A **lint-report note** (under `Review/` or a scratch note) summarizing findings.
- **Review items** in `Review/` for each actionable issue (`#reviewType`, predefined action, search query).
- A **Log** entry: `## [<today>] lint | <summary>`.

## Hard rules (recap)

- Never delete alone — flag for approval via Review.
- Never create content pages (that's ingest's job) — only Review items + the lint report.
- Fix metadata only when the correct value is unambiguous.
- Always log the pass.

# QUERY — answer a question from the wiki

Retrieval pipeline: navigate the map, expand via the graph, then read only the selected bodies.

## Steps

1. **Orient.** Read the vault `Purpose` and `Index` first — these are the map. They tell you what's in the wiki and where.
2. **Retrieve.** Call `query_wiki` with the question (it runs: search → `find_related` 2-hop graph expansion → token-budget selection → numbered pages `[1][2]…` with snippets). This is the "map, not bodies" entry point.
   - For a targeted lookup, use `search_by_attribute` (`#wikiLayer=concept`, `#status=weak`, etc.) or `find_related` from a known note directly.
3. **Read selected bodies.** Only for the pages `query_wiki` returned (or your ~10 hand-picked noteIds), call `get_note_content`. Do not read bodies to search.
4. **Synthesize.** Answer the question, citing pages by their numbers **[1][2]** → noteId/path from the `query_wiki` result. Surface uncertainty; mark claims that rest on `#status=weak` pages.
5. **File valuable answers.** If the answer is non-trivial and reusable, file it as a `Wiki/Synthesis/` page: `#wikiLayer=synthesis #status=<…> #updated=<today>`, with `derivedFrom` → the pages you cited. Update `Index` + `Log` (`## [<today>] query | <question>`).

## Budget

`query_wiki` already applies the token budget (60% wiki-content / 20% overview / 10% source / 10% other). Trust it; only fetch more bodies if a cited page's snippet is insufficient for the synthesis.

## Hard rules (recap)

- Never read all bodies to search — Index/search/query_wiki first.
- Cite every claim by number → noteId.
- File valuable syntheses back (the wiki grows from queries).

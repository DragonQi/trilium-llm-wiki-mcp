# DELETE — remove a source (cascade cleanup)

Run only on an explicit user command. **Always confirm with the user before deleting.**

## Steps

1. **Identify derived pages.** From the Raw note, follow `derivedFrom` (reverse) to find all summaries/syntheses that cite it: `search_by_attribute` or `get_backlinks` with `relations=["derivedFrom"]`.
2. **Cascade by sharing:**
   - **Sole source** (page's `#sources == 1` and derives only from this Raw): delete the page (`delete_note`).
   - **Shared source** (page cites multiple Raws): decrement `#sources`, remove this page's `derivedFrom` relation to the Raw (`delete_attribute`), update `#updated`. Do **not** delete the page.
3. **Delete the Raw note** (`delete_note`).
4. **Clean up** the `Index` (remove/rewrite lines for deleted pages) and any now-dead relations.
5. **Log**: `## [<today>] delete | <source title>`.

## Hard rules (recap)

- User confirmation required before any deletion.
- Never delete a shared entity/concept page — only detach the source.
- Always update Index + Log in the same pass.

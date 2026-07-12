import { findRelated } from "./relevance.js";
import { snippet, stripHtml } from "../lib/html.js";
import type { EtapiClient } from "../etapi/client.js";
import type { QueryWikiPage, QueryWikiResult, WikiType } from "./types.js";

const TARGET_PAGES = 10;
const EXPAND_SEEDS = 5;
const PER_SEED = 3;
const SNIPPET_MAX = 300;

// Budget proportions (history slot adapted — ETAPI has no revisions).
const BUDGET = {
  content: 0.6, // concept/entity/summary/synthesis
  overview: 0.2,
  source: 0.1, // raw/source
  other: 0.1,
};
const EXCLUDE_TYPES: WikiType[] = ["index", "log", "review"];

function bucket(t: WikiType): keyof typeof BUDGET {
  if (t === "overview") return "overview";
  if (t === "source" || t === "raw") return "source";
  if (
    t === "concept" ||
    t === "entity" ||
    t === "summary" ||
    t === "synthesis" ||
    t === "query" ||
    t === "comparison"
  )
    return "content";
  return "other";
}

export async function queryWiki(
  client: EtapiClient,
  query: string,
  opts: { fastSearch?: boolean; maxPages?: number } = {},
): Promise<QueryWikiResult> {
  const target = opts.maxPages ?? TARGET_PAGES;

  // 1. search
  const seeds = await client.searchNotes({ search: query, limit: 20, fastSearch: opts.fastSearch });
  const pool = new Map<string, { score: number; wikiType: WikiType }>();
  let truncated = false;

  for (const s of seeds.slice(0, EXPAND_SEEDS)) {
    const wt = (s.attributes.find((a) => a.name === "wikiType")?.value as WikiType) ?? "unknown";
    pool.set(s.noteId, { score: 1, wikiType: wt }); // search hit baseline
  }

  // 2. expand via find_related
  for (const s of seeds.slice(0, EXPAND_SEEDS)) {
    const { scores, truncated: t } = await findRelated(client, s.noteId, {
      maxResults: PER_SEED,
      maxNodes: 100,
    });
    if (t) truncated = true;
    for (const rel of scores) {
      const prev = pool.get(rel.noteId);
      const add = rel.compositeScore;
      pool.set(rel.noteId, {
        score: (prev?.score ?? 0) + add,
        wikiType: rel.wikiType,
      });
    }
  }

  // 3. rerank by score desc
  const ranked = [...pool.entries()]
    .filter(([, m]) => !EXCLUDE_TYPES.includes(m.wikiType))
    .sort((a, b) => b[1].score - a[1].score);

  // 4. budget by bucket
  const selected: { noteId: string; wikiType: WikiType }[] = [];
  const caps: Record<keyof typeof BUDGET, number> = {
    content: Math.round(target * BUDGET.content),
    overview: Math.round(target * BUDGET.overview),
    source: Math.round(target * BUDGET.source),
    other: Math.round(target * BUDGET.other),
  };
  const counts: Record<keyof typeof BUDGET, number> = { content: 0, overview: 0, source: 0, other: 0 };
  for (const [noteId, m] of ranked) {
    const b = bucket(m.wikiType);
    if (counts[b] < caps[b]) {
      selected.push({ noteId, wikiType: m.wikiType });
      counts[b]++;
    }
    if (selected.length >= target) break;
  }
  if (selected.length < target) {
    const have = new Set(selected.map((s) => s.noteId));
    for (const [noteId, m] of ranked) {
      if (selected.length >= target) break;
      if (have.has(noteId)) continue;
      selected.push({ noteId, wikiType: m.wikiType });
    }
  }

  // 5. assemble with snippets + best-effort path
  const pages: QueryWikiPage[] = [];
  let n = 0;
  for (const sel of selected) {
    n++;
    let note;
    try {
      note = await client.getNote(sel.noteId);
    } catch {
      continue;
    }
    let body = "";
    try {
      body = stripHtml(await client.getNoteContent(sel.noteId));
    } catch {
      /* protected/unreadable — empty snippet */
    }
    const path = note.parentNoteIds.length ? `${note.parentNoteIds[0]}/…/${note.title}` : note.title;
    pages.push({
      n,
      noteId: sel.noteId,
      title: note.title,
      path,
      wikiType: sel.wikiType,
      snippet: snippet(body, SNIPPET_MAX),
    });
  }

  return {
    query,
    pages,
    truncated,
    hint: `Cite as [n] where n maps to noteId (e.g. [1] → ${pages[0]?.noteId ?? "n/a"}). Synthesize from snippets; fetch full bodies only if needed.`,
  };
}

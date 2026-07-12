# Trilium MCP Graph Core (WF2 / Plan 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]` syntax.

**Goal:** Add the wiki-oriented graph layer to `trilium-llm-wiki-mcp`: `find_related` (4-signal relevance ranking over Trilium's typed-relation graph) and `query_wiki` (retrieval pipeline: search → graph expansion → token-budget → numbered-citation assembly). These are the core tools the SKILL (WF4) uses for QUERY and LINT.

**Architecture:** A new `src/graph/` module sits **on top of** the `EtapiClient` — the client stays pure ETAPI I/O; the graph module fetches relations via the client, builds an in-memory `graphology` directed graph around a seed, and computes relevance. Tools (`src/tools/graph.ts`) are thin wrappers over `findRelated(client, …)` / `queryWiki(client, …)`. This keeps the ETAPI client single-purpose (spec §4.1) while isolating graph algorithms testably.

**Tech Stack:** adds `graphology@^0.25.1` (MIT, bundled TypeScript types). Everything else unchanged.

## Design decisions (locked for this plan; constants are configurable)

These concretize the abstract Karpathy→Trilium design (spec §3.4) into engineering. Each is a named constant in code, so it can be tuned without rewriting logic.

1. **Relation graph model.** Nodes = notes; directed edges = Trilium **relations** (attributes with `type: "relation"`), labeled by relation name. Edges considered for relevance: `derivedFrom`, `relatesTo`, `mentions`, `about`, `partOf`, `supersedes`, `contradicts`. (`derivedFrom` also seeds source-overlap; the others seed direct-link / common-neighbor.)
2. **Local graph bounds** (BFS around seed): `maxNodes = 150`, `maxPerNode = 25` children fetched per hop, **2 hops**. Keeps ETAPI request count bounded (~150 `getNote` calls worst case).
3. **Node metadata** captured per note: `{ title, wikiType, derivedFromTargets: Set<noteId> }`. `wikiType` read from the note's `#wikiType` label (absent → `unknown`).
4. **4-signal relevance** (weights per spec §3.4, as constants):
   - `directLink` (weight **3**): `1` if any edge exists between seed and candidate in either direction, else `0`.
   - `sourceOverlap` (weight **4**): `|derivedFromTargets[seed] ∩ derivedFromTargets[candidate]|` (count of shared raw sources).
   - `adamicAdar` (weight **1.5**): `Σ_{n ∈ neighbors(seed) ∩ neighbors(candidate)} 1 / log(degree(n))` (neighbors = union of in+out; degree = total in+out degree).
   - `typeAffinity` (weight **1**): looked up in the matrix below.
   - **Composite** = `3·directLink + 4·sourceOverlap + 1.5·adamicAdar + 1·typeAffinity`. Candidates with composite `0` are dropped.
5. **typeAffinity matrix** (default `TYPE_AFFINITY` const; `unknown` type → baseline `0.3`):
   - same type → `1.0`
   - `concept`↔`entity` (either order) → `0.6`
   - `overview`↔(any) → `0.5`
   - `synthesis`↔{`concept`,`entity`,`query`} → `0.5`
   - `summary`↔{`concept`,`entity`} → `0.4`
   - otherwise → `0.1`
6. **find_related output**: top-N (default **15**) `ScoredNote` (noteId, title, wikiType, compositeScore, signals) sorted desc, seed excluded.
7. **query_wiki pipeline**:
   - **search**: `searchNotes(query, limit=20)`.
   - **expand**: for the top **5** seeds, `findRelated(seed, maxResults=3)`; union into a pool keyed by noteId, summing scores; add the search hits themselves.
   - **rerank**: sort pool by composite score desc.
   - **budget** (target **10** pages, configurable; spec's 60/20/5/15 — history slot adapted since ETAPI exposes no revisions): ~60% wiki-content types (`concept`/`entity`/`summary`/`synthesis`), ~20% `overview`, ~10% `source`/raw, ~10% other/related. Exclude `index`/`log`/`review` types.
   - **assemble**: for each selected page, `getNoteContent` and extract a snippet (first ~300 chars of text, HTML-stripped to text); number them `[1]..[N]`.
   - **return** `{ query, pages: [{ n, noteId, title, path, wikiType, snippet }], hint }` where `hint` tells the agent to cite as `[n]` mapped to `noteId`.

## Global Constraints (additions; prior constraints still apply)

- **Clean-room, MIT**, env-only config, NodeNext ESM, Git Bash — unchanged.
- **graphology@^0.25.1** is the only new dependency; it ships its own TS types (no `@types` needed). Import from `"graphology"` and `"graphology"` only (no communities lib in v1 — that's v1.5).
- **No `Date.now()`/`Math.random()` in workflow scripts** — N/A here (this is regular TS, not a workflow script), so normal APIs are fine.
- **Map-not-bodies**: `query_wiki` returns short snippets + metadata, never full note bodies (the agent fetches bodies only for the ~10 selected pages, if needed — but the snippet is already included).
- **Cost awareness**: graph operations fan out ETAPI calls. Bounds (#2) are hard caps; tools must surface "truncated" in the result when a cap is hit.
- **wikiType may be absent** (vault not yet wiki-initialized until WF3). All signals degrade gracefully — `typeAffinity` falls back to the `unknown` baseline; `find_related`/`query_wiki` work on raw relations regardless.

---

## File Structure (additions)

```
src/
├── graph/
│   ├── types.ts          # ScoredNote, NodeMeta, LocalGraphData, QueryWikiResult, GraphOpts
│   ├── type-affinity.ts  # TYPE_AFFINITY matrix + affinity(a, b)
│   ├── builder.ts        # buildLocalGraph(client, seedNoteId, opts) → LocalGraphData
│   ├── signals.ts        # directLink, sourceOverlap, adamicAdar (pure fns over LocalGraphData)
│   ├── relevance.ts      # findRelated(client, seedNoteId, opts) → ScoredNote[]
│   └── query.ts          # queryWiki(client, query, opts) → QueryWikiResult
├── tools/
│   ├── graph.ts          # find_related, query_wiki tools + registerGraph
│   └── index.ts          # MODIFY: +registerGraph
└── lib/
    └── html.ts           # NEW: stripHtml(html) → plain text (for snippets)
tests/
├── unit/graph/{type-affinity,builder,signals,relevance,query}.test.ts  # NEW
├── unit/tools/graph.test.ts                                            # NEW
└── integration/graph.integration.test.ts                                # NEW
```

**Responsibilities:** `builder.ts` owns ETAPI→graphology translation (the only place that fans out requests); `signals.ts` are pure functions over the built graph (trivially unit-testable with a hand-built graph); `relevance.ts`/`query.ts` orchestrate; `html.ts` is a tiny dependency-free HTML→text stripper for snippets.

---

## Task 1: Add graphology dependency

- [ ] **Step 1: Install**

```bash
npm install graphology
```

- [ ] **Step 2: Verify types resolve**

Run: `node --input-type=module -e "import('graphology').then(g => console.log(typeof g.DirectedGraph))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add graphology dependency (WF2b)"
```

---

## Task 2: Graph types

**Files:** Create `src/graph/types.ts`

- [ ] **Step 1: Implement**

```ts
export type WikiType =
  | "entity"
  | "concept"
  | "source"
  | "query"
  | "comparison"
  | "synthesis"
  | "overview"
  | "summary"
  | "raw"
  | "index"
  | "log"
  | "review"
  | "unknown";

export interface NodeMeta {
  noteId: string;
  title: string;
  wikiType: WikiType;
  derivedFromTargets: Set<string>; // raw-source noteIds this note is derivedFrom
}

export interface LocalGraphData {
  seedNoteId: string;
  nodes: Map<string, NodeMeta>;
  // adjacency: noteId -> set of neighbor noteIds (union of in+out, across all relation types)
  neighbors: Map<string, Set<string>>;
  // undirected-degree (in+out) per node, precomputed for Adamic-Adar
  degree: Map<string, number>;
  truncated: boolean; // true if a bound (maxNodes/maxPerNode) was hit
}

export interface SignalScores {
  directLink: number;
  sourceOverlap: number;
  adamicAdar: number;
  typeAffinity: number;
}

export interface ScoredNote {
  noteId: string;
  title: string;
  wikiType: WikiType;
  compositeScore: number;
  signals: SignalScores;
}

export interface GraphOpts {
  maxNodes?: number; // default 150
  maxPerNode?: number; // default 25
}

export interface FindRelatedOpts extends GraphOpts {
  maxResults?: number; // default 15
}

export interface QueryWikiPage {
  n: number; // citation index, 1-based
  noteId: string;
  title: string;
  path: string; // "/"-joined titles root→note (best-effort)
  wikiType: WikiType;
  snippet: string; // plain-text, ~300 chars
}

export interface QueryWikiResult {
  query: string;
  pages: QueryWikiPage[];
  truncated: boolean;
  hint: string; // citation instruction for the agent
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/graph/types.ts
git commit -m "feat(graph): graph types — ScoredNode, LocalGraphData, QueryWikiResult (WF2b)"
```

---

## Task 3: type-affinity matrix

**Files:** Create `src/graph/type-affinity.ts`, `tests/unit/graph/type-affinity.test.ts`

- [ ] **Step 1: Implement `src/graph/type-affinity.ts`**

```ts
import type { WikiType } from "./types.js";

// affinity(a, b) is symmetric. Missing/unknown types use the UNKNOWN baseline.
const UNKNOWN_BASELINE = 0.3;

// Key "X|Y" with X <= Y lexicographically; lookup normalizes order.
const PAIR: Record<string, number> = {
  // same-type handled separately (= 1.0)
  "concept|entity": 0.6,
  "concept|synthesis": 0.5,
  "entity|synthesis": 0.5,
  "query|synthesis": 0.5,
  "concept|summary": 0.4,
  "entity|summary": 0.4,
};

// overview is close to everything (it's the evolving thesis).
const OVERVIEW_AFFINITY = 0.5;

function key(a: WikiType, b: WikiType): string {
  return [a, b].sort().join("|");
}

export function affinity(a: WikiType, b: WikiType): number {
  if (a === b) return 1.0;
  if (a === "overview" || b === "overview") return OVERVIEW_AFFINITY;
  if (a === "unknown" || b === "unknown") return UNKNOWN_BASELINE;
  return PAIR[key(a, b)] ?? 0.1;
}
```

- [ ] **Step 2: Test `tests/unit/graph/type-affinity.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { affinity } from "../../../src/graph/type-affinity.js";

describe("affinity", () => {
  it("is 1.0 for same type", () => {
    expect(affinity("entity", "entity")).toBe(1.0);
  });
  it("concept/entity = 0.6", () => {
    expect(affinity("concept", "entity")).toBe(0.6);
    expect(affinity("entity", "concept")).toBe(0.6);
  });
  it("overview with anything = 0.5", () => {
    expect(affinity("overview", "entity")).toBe(0.5);
  });
  it("unknown falls back to 0.3", () => {
    expect(affinity("unknown", "concept")).toBe(0.3);
  });
  it("unrelated pair = 0.1", () => {
    expect(affinity("raw", "log")).toBe(0.1);
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npm test -- tests/unit/graph/type-affinity.test.ts
git add src/graph/type-affinity.ts tests/unit/graph/type-affinity.test.ts
git commit -m "feat(graph): typeAffinity matrix (WF2b)"
```

---

## Task 4: Graph builder

**Files:** Create `src/graph/builder.ts`; Modify `src/etapi/client.ts` (add `getRelationTargets` helper if convenient — optional).

**Interfaces:**
- Produces: `buildLocalGraph(client, seedNoteId, opts): Promise<LocalGraphData>` — BFS 2-hop over relations, bounded by `maxNodes`/`maxPerNode`, capturing `wikiType` + `derivedFromTargets` per node.

- [ ] **Step 1: Implement `src/graph/builder.ts`**

```ts
import type { EtapiClient } from "../etapi/client.js";
import type { Attribute } from "../etapi/types.js";
import type { GraphOpts, LocalGraphData, NodeMeta, WikiType } from "./types.js";

const DEFAULTS = { maxNodes: 150, maxPerNode: 25 };

function wikiTypeOf(attrs: Attribute[]): WikiType {
  const t = attrs.find((a) => a.type === "label" && a.name === "wikiType")?.value;
  return (t as WikiType) ?? "unknown";
}

function relationTargets(attrs: Attribute[]): { name: string; target: string }[] {
  return attrs.filter((a) => a.type === "relation").map((a) => ({ name: a.name, target: a.value }));
}

export async function buildLocalGraph(
  client: EtapiClient,
  seedNoteId: string,
  opts: GraphOpts = {},
): Promise<LocalGraphData> {
  const maxNodes = opts.maxNodes ?? DEFAULTS.maxNodes;
  const maxPerNode = opts.maxPerNode ?? DEFAULTS.maxPerNode;

  const nodes = new Map<string, NodeMeta>();
  const neighbors = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  let truncated = false;

  const ensureMeta = (noteId: string, title: string, attrs: Attribute[]): NodeMeta => {
    let meta = nodes.get(noteId);
    if (!meta) {
      const targets = new Set<string>();
      for (const r of relationTargets(attrs)) {
        if (r.name === "derivedFrom") targets.add(r.target);
      }
      meta = { noteId, title, wikiType: wikiTypeOf(attrs), derivedFromTargets: targets };
      nodes.set(noteId, meta);
      neighbors.set(noteId, new Set());
      degree.set(noteId, 0);
    }
    return meta;
  };

  const addNeighbor = (a: string, b: string): void => {
    if (a === b) return;
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  };

  // BFS, 2 hops.
  const seed = await client.getNote(seedNoteId);
  ensureMeta(seedNoteId, seed.title, seed.attributes);
  const frontier: string[] = [seedNoteId];
  const visitedHops = new Set<string>([seedNoteId]);

  for (let hop = 0; hop < 2 && frontier.length; hop++) {
    const next: string[] = [];
    // fetch relations of each frontier node (already have seed; others need getNote)
    for (const noteId of frontier) {
      if (nodes.size >= maxNodes) {
        truncated = true;
        break;
      }
      const note = noteId === seedNoteId ? seed : await client.getNote(noteId);
      ensureMeta(noteId, note.title, note.attributes);
      const rels = relationTargets(note.attributes).slice(0, maxPerNode);
      if (relationTargets(note.attributes).length > maxPerNode) truncated = true;
      for (const { target } of rels) {
        if (nodes.size >= maxNodes) {
          truncated = true;
          break;
        }
        ensureMeta(target, target, []); // placeholder; wikiType filled when visited
        addNeighbor(noteId, target);
        if (!visitedHops.has(target)) {
          visitedHops.add(target);
          next.push(target);
        }
      }
    }
    frontier.length = 0;
    frontier.push(...next);
  }

  return { seedNoteId, nodes, neighbors, degree, truncated };
}
```

- [ ] **Step 2: Unit test (mock client returns canned notes with relations)** — `tests/unit/graph/builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLocalGraph } from "../../../src/graph/builder.js";
import { mockClient } from "../../helpers/mockClient.js";

describe("buildLocalGraph", () => {
  it("walks 2 hops and captures derivedFrom + neighbors", async () => {
    const client = mockClient();
    client.getNote.mockImplementation(async (id: string) => {
      const notes: Record<string, any> = {
        seed: { noteId: "seed", title: "Seed", attributes: [
          { type: "relation", name: "relatesTo", value: "a" },
          { type: "relation", name: "derivedFrom", value: "src1" },
          { type: "label", name: "wikiType", value: "concept" },
        ] },
        a: { noteId: "a", title: "A", attributes: [
          { type: "relation", name: "relatesTo", value: "b" },
        ] },
        b: { noteId: "b", title: "B", attributes: [] },
        src1: { noteId: "src1", title: "Src1", attributes: [] },
      };
      return notes[id];
    });
    const g = await buildLocalGraph(client, "seed", { maxNodes: 50, maxPerNode: 25 });
    expect([...g.nodes.keys()].sort()).toEqual(["a", "b", "seed", "src1"]);
    expect(g.nodes.get("seed")!.derivedFromTargets.has("src1")).toBe(true);
    expect(g.nodes.get("seed")!.wikiType).toBe("concept");
    expect(g.neighbors.get("seed")!.has("a")).toBe(true);
    expect(g.neighbors.get("a")!.has("b")).toBe(true);
    expect(g.truncated).toBe(false);
  });

  it("sets truncated when maxNodes is hit", async () => {
    const client = mockClient();
    client.getNote.mockResolvedValue({
      noteId: "x",
      title: "X",
      attributes: [
        { type: "relation", name: "relatesTo", value: "y" },
        { type: "relation", name: "relatesTo", value: "z" },
      ],
    });
    const g = await buildLocalGraph(client, "seed", { maxNodes: 2, maxPerNode: 25 });
    expect(g.truncated).toBe(true);
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npm test -- tests/unit/graph/builder.test.ts
git add src/graph/builder.ts tests/unit/graph/builder.test.ts
git commit -m "feat(graph): local graph builder (2-hop BFS over relations) (WF2b)"
```

---

## Task 5: Relevance signals

**Files:** Create `src/graph/signals.ts`, `tests/unit/graph/signals.test.ts`

- [ ] **Step 1: Implement `src/graph/signals.ts`** (pure functions over `LocalGraphData`)

```ts
import { affinity } from "./type-affinity.js";
import type { LocalGraphData, NodeMeta } from "./types.js";

/** 1 if any edge between seed and candidate (either direction), else 0. */
export function directLink(data: LocalGraphData, candidateId: string): number {
  const seedNeighbors = data.neighbors.get(data.seedNoteId);
  return seedNeighbors && seedNeighbors.has(candidateId) ? 1 : 0;
}

/** Number of shared derivedFrom raw sources. */
export function sourceOverlap(seed: NodeMeta, candidate: NodeMeta): number {
  let count = 0;
  for (const t of seed.derivedFromTargets) if (candidate.derivedFromTargets.has(t)) count++;
  return count;
}

/** Adamic-Adar: sum over common neighbors of 1/log(degree). */
export function adamicAdar(data: LocalGraphData, candidateId: string): number {
  const seedN = data.neighbors.get(data.seedNoteId);
  const candN = data.neighbors.get(candidateId);
  if (!seedN || !candN) return 0;
  let sum = 0;
  for (const n of seedN) {
    if (!candN.has(n)) continue;
    const deg = data.degree.get(n) ?? 0;
    if (deg > 1) sum += 1 / Math.log(deg);
  }
  return sum;
}

export function typeAffinity(seed: NodeMeta, candidate: NodeMeta): number {
  return affinity(seed.wikiType, candidate.wikiType);
}
```

- [ ] **Step 2: Test with a hand-built `LocalGraphData`** — cover all 4 signals (directLink both directions, sourceOverlap shared count, adamicAdar with known degrees, typeAffinity via matrix). At least 4 assertions.

- [ ] **Step 3: Run, commit** — `feat(graph): 4 relevance signals (directLink/sourceOverlap/adamicAdar/typeAffinity) (WF2b)`.

---

## Task 6: find_related (relevance orchestration + tool)

**Files:** Create `src/graph/relevance.ts`, `src/tools/graph.ts` (find_related part), `tests/unit/graph/relevance.test.ts`

**Interfaces:**
- `findRelated(client, seedNoteId, opts): Promise<{ scores: ScoredNote[]; truncated: boolean }>` — build graph, score every non-seed node, sort desc, take top `maxResults`, drop zero-composite.

- [ ] **Step 1: Implement `src/graph/relevance.ts`**

```ts
import { buildLocalGraph } from "./builder.js";
import { adamicAdar, directLink, sourceOverlap, typeAffinity } from "./signals.js";
import type { FindRelatedOpts, ScoredNode, SignalScores } from "./types.js";
import type { EtapiClient } from "../etapi/client.js";

const WEIGHTS = { directLink: 3, sourceOverlap: 4, adamicAdar: 1.5, typeAffinity: 1 };
const DEFAULT_MAX_RESULTS = 15;

export async function findRelated(
  client: EtapiClient,
  seedNoteId: string,
  opts: FindRelatedOpts = {},
): Promise<{ scores: ScoredNode[]; truncated: boolean }> {
  const data = await buildLocalGraph(client, seedNoteId, opts);
  const seed = data.nodes.get(seedNoteId)!;
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;

  const scored: ScoredNode[] = [];
  for (const [candidateId, meta] of data.nodes) {
    if (candidateId === seedNoteId) continue;
    const signals: SignalScores = {
      directLink: directLink(data, candidateId),
      sourceOverlap: sourceOverlap(seed, meta),
      adamicAdar: adamicAdar(data, candidateId),
      typeAffinity: typeAffinity(seed, meta),
    };
    const composite =
      WEIGHTS.directLink * signals.directLink +
      WEIGHTS.sourceOverlap * signals.sourceOverlap +
      WEIGHTS.adamicAdar * signals.adamicAdar +
      WEIGHTS.typeAffinity * signals.typeAffinity;
    if (composite <= 0) continue;
    scored.push({
      noteId: candidateId,
      title: meta.title,
      wikiType: meta.wikiType,
      compositeScore: Number(composite.toFixed(4)),
      signals,
    });
  }
  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  return { scores: scored.slice(0, maxResults), truncated: data.truncated };
}
```

- [ ] **Step 2: Add `find_related` tool to `src/tools/graph.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asToolResult } from "../lib/errors.js";
import type { CallToolResult } from "../lib/errors.js";
import type { EtapiClient } from "../etapi/client.js";
import { findRelated } from "../graph/relevance.js";
import { queryWiki } from "../graph/query.js";

export async function findRelatedHandler(
  args: { noteId: string; maxResults?: number; maxNodes?: number },
  client: EtapiClient,
): Promise<CallToolResult> {
  return asToolResult(
    () => findRelated(client, args.noteId, { maxResults: args.maxResults, maxNodes: args.maxNodes }),
    (r) => JSON.stringify(r),
  );
}

export function registerGraph(server: McpServer, client: EtapiClient): void {
  server.registerTool(
    "find_related",
    {
      description:
        "Rank notes related to a seed by 4-signal relevance over Trilium relations (directLink×3 + sourceOverlap×4 + Adamic-Adar×1.5 + typeAffinity×1). Core of QUERY graph expansion and a LINT orphan/bridge signal.",
      inputSchema: {
        noteId: z.string(),
        maxResults: z.number().int().positive().max(100).optional(),
        maxNodes: z.number().int().positive().max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (a) => findRelatedHandler(a as Parameters<typeof findRelatedHandler>[0], client),
  );
  // query_wiki registered in Task 7.
}
```

- [ ] **Step 3: Unit test `relevance.test.ts`** — mock client building a known 3-node graph (seed↔a↔b, seed & a share a derivedFrom source `src1`), assert `a` outranks `b` and `src1` (zero composite if isolated) is dropped.

- [ ] **Step 4: Run, commit** — `feat(graph): find_related — 4-signal relevance ranking + tool (WF2b)`.

---

## Task 7: query_wiki pipeline + tool

**Files:** Create `src/lib/html.ts`, `src/graph/query.ts`; extend `src/tools/graph.ts` (register `query_wiki`).

- [ ] **Step 1: Implement `src/lib/html.ts`** (dependency-free stripper, good enough for snippets)

```ts
/** Minimal HTML→text for snippets: strip tags, collapse whitespace, decode common entities. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function snippet(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
```

- [ ] **Step 2: Implement `src/graph/query.ts`**

```ts
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
  if (t === "concept" || t === "entity" || t === "summary" || t === "synthesis" || t === "query" || t === "comparison")
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
    const { scores, truncated: t } = await findRelated(client, s.noteId, { maxResults: PER_SEED, maxNodes: 100 });
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
  // First pass: respect buckets.
  for (const [noteId, m] of ranked) {
    const b = bucket(m.wikiType);
    if (counts[b] < caps[b]) {
      selected.push({ noteId, wikiType: m.wikiType });
      counts[b]++;
    }
    if (selected.length >= target) break;
  }
  // Second pass: backfill from remaining ranked if a bucket was under-filled.
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
```

- [ ] **Step 3: Register `query_wiki` in `src/tools/graph.ts`** (append inside `registerGraph`, before the closing brace):

```ts
  server.registerTool(
    "query_wiki",
    {
      description:
        "Retrieval pipeline for the LLM-wiki: search → graph expansion (find_related, 2-hop) → token-budget (60% wiki content / 20% overview / 10% source / 10% other) → assembly with numbered citation pages [1][2]. Returns short snippets + a citation hint; fetch full bodies only for pages you cite.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language or Trilium search expression"),
        fastSearch: z.boolean().optional(),
        maxPages: z.number().int().positive().max(30).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (a) =>
      asToolResult(
        () => queryWiki(client, (a as { query: string }).query, { fastSearch: (a as { fastSearch?: boolean }).fastSearch, maxPages: (a as { maxPages?: number }).maxPages }),
        (r) => JSON.stringify(r),
      ),
  );
```

- [ ] **Step 4: Unit test `query.test.ts`** — mock client: `searchNotes` returns 2 notes; `getNote`/`getNoteContent` return canned; `findRelated` is mocked (vi.mock `../graph/relevance.js`) to return 1 related note; assert the result has numbered pages, the citation hint references page 1's noteId, and an excluded `index`-type note is filtered out.

- [ ] **Step 5: Run, commit** — `feat(graph): query_wiki retrieval pipeline + tool; html snippet helper (WF2b)`.

---

## Task 8: Aggregate graph tools + integration test

**Files:** Modify `src/tools/index.ts`, `tests/unit/tools/index.test.ts`; Create `tests/integration/graph.integration.test.ts`

- [ ] **Step 1: Register `registerGraph` in `src/tools/index.ts`** (import + call alongside the other 13).

- [ ] **Step 2: Add `find_related` and `query_wiki` to the `EXPECTED` list in `tests/unit/tools/index.test.ts`** (now 51 tools).

- [ ] **Step 3: Create `tests/integration/graph.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EtapiClient } from "../../src/etapi/client.js";
import {
  integrationEnabled,
  liveClient,
  ensureTestRoot,
  cleanupTestRoot,
  waitForSearch,
} from "../helpers/integration.js";
import { findRelated } from "../../src/graph/relevance.js";
import { queryWiki } from "../../src/graph/query.js";

const describeIntegration = integrationEnabled() ? describe : describe.skip;

describeIntegration("graph core (integration)", () => {
  let client: EtapiClient;
  let rootId: string;

  beforeAll(async () => {
    client = liveClient();
    rootId = await ensureTestRoot(client);
  });
  afterAll(async () => {
    if (rootId) await cleanupTestRoot(client, rootId);
  });

  it("find_related ranks a neighbor above an isolated note", async () => {
    const a = (await client.createNote({ parentNoteId: rootId, title: "gr-a", type: "text", content: "" })).note.noteId;
    const b = (await client.createNote({ parentNoteId: rootId, title: "gr-b", type: "text", content: "" })).note.noteId;
    const iso = (await client.createNote({ parentNoteId: rootId, title: "gr-iso", type: "text", content: "" })).note.noteId;
    // a -> b relation; iso has no relations.
    await client.upsertAttribute({ noteId: a, type: "relation", name: "relatesTo", value: b });
    await waitForSearch(client, "~relatesTo.noteId", (n) => n.some((x) => x.noteId === a));
    const { scores } = await findRelated(client, a, { maxNodes: 50 });
    const ids = scores.map((s) => s.noteId);
    expect(ids).toContain(b);
    expect(ids).not.toContain(iso); // zero composite → dropped
    const bScore = scores.find((s) => s.noteId === b)!.compositeScore;
    expect(bScore).toBeGreaterThan(0);
    await client.deleteNote(a);
    await client.deleteNote(b);
    await client.deleteNote(iso);
  });

  it("query_wiki returns numbered pages with a citation hint", async () => {
    const note = await client.createNote({ parentNoteId: rootId, title: "qw-target", type: "text", content: "<p>graph retrieval works</p>" });
    await waitForSearch(client, "qw-target", (n) => n.some((x) => x.noteId === note.note.noteId));
    const r = await queryWiki(client, "qw-target", { maxPages: 5 });
    expect(r.pages.length).toBeGreaterThan(0);
    expect(r.pages[0]!.n).toBe(1);
    expect(r.hint).toContain("[1]");
    await client.deleteNote(note.note.noteId);
  });
});
```

- [ ] **Step 4: Run all tests + build + lint + integration**

```bash
npm test && npm run build && npm run lint && npm run test:integration
```
Expected: unit tests green (now including graph suite + 51-tool registration), build/lint clean, integration green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.ts tests/unit/tools/index.test.ts tests/integration/graph.integration.test.ts
git commit -m "feat(graph): aggregate find_related/query_wiki (51 tools) + integration (WF2b)"
```

---

## Self-Review

**1. Spec coverage:**
- §3.4 4-signal relevance (directLink×3 + sourceOverlap×4 + Adamic-Adar×1.5 + typeAffinity×1): Tasks 3+5+6 ✓.
- §3.4 / §5.3 retrieval pipeline + token-budget + numbered citations: Task 7 ✓ (history slot adapted — ETAPI has no revisions; documented).
- §5.5 "map not bodies": query_wiki returns snippets only ✓.
- §4.2 composite tools `find_related`, `query_wiki`: Tasks 6+7 ✓.
- §6.2 unit (mocked client / hand-built graph) + integration (live) tests: Tasks 3–8 ✓.

**2. Placeholder scan:** no TBD; every signal, the matrix, the budget buckets, and the pipeline steps carry concrete code. typeAffinity values are explicit constants (not "appropriate values").

**3. Type consistency:** `ScoredNote`, `LocalGraphData`, `NodeMeta`, `QueryWikiResult`, `WikiType` are defined once (Task 2) and reused with matching field names in builder/signals/relevance/query/tools. `findRelated`/`queryWiki` signatures match their handlers. Tool names (`find_related`, `query_wiki`) match the extended `EXPECTED` list (51 total).

**Gaps deferred (v1.5 / later rounds):** Louvain communities + cohesion (graph lint), graph insights / surprising connections, Deep Research path, scenario templates — these are §3.4 v1.5 items and later rounds (WF3–WF7). `resolve_review` / `deep_research` composite tools are deferred to WF3/4 (they depend on the Review/ schema which arrives with the SKILL).

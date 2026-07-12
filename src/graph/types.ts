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
  // undirected degree (in+out) per node, precomputed for Adamic-Adar
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
  path: string; // "/"-joined titles root->note (best-effort)
  wikiType: WikiType;
  snippet: string; // plain-text, ~300 chars
}

export interface QueryWikiResult {
  query: string;
  pages: QueryWikiPage[];
  truncated: boolean;
  hint: string; // citation instruction for the agent
}

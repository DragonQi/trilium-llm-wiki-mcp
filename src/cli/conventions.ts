export const VAULT_ROOT_TITLE = "LLM Wiki";

// Layer label values per structural node. Inheritable ones propagate to children.
export type WikiLayer =
  | "purpose"
  | "raw"
  | "wiki"
  | "summary"
  | "concept"
  | "entity"
  | "query"
  | "comparison"
  | "overview"
  | "synthesis"
  | "review"
  | "index"
  | "log";

export interface StructureNode {
  title: string;
  layer: WikiLayer;
  inheritable: boolean; // #wikiLayer is inheritable on this node
  type: "book" | "text";
  template?: string; // HTML body for text nodes
  children?: StructureNode[];
}

export const VAULT_STRUCTURE: StructureNode = {
  title: VAULT_ROOT_TITLE,
  layer: "wiki",
  inheritable: false,
  type: "book",
  children: [
    {
      title: "Purpose",
      layer: "purpose",
      inheritable: false,
      type: "text",
      template:
        "<h1>Purpose</h1><p>Goal: …</p><h2>Key questions</h2><ul><li>…</li></ul><h2>Scope</h2><p>…</p><h2>Thesis</h2><p>…</p>",
    },
    { title: "Raw", layer: "raw", inheritable: true, type: "book" },
    {
      title: "Wiki",
      layer: "wiki",
      inheritable: false,
      type: "book",
      children: [
        { title: "Summaries", layer: "summary", inheritable: true, type: "book" },
        { title: "Concepts", layer: "concept", inheritable: true, type: "book" },
        { title: "Entities", layer: "entity", inheritable: true, type: "book" },
        { title: "Queries", layer: "query", inheritable: true, type: "book" },
        { title: "Comparisons", layer: "comparison", inheritable: true, type: "book" },
        { title: "Overview", layer: "overview", inheritable: true, type: "book" },
        { title: "Synthesis", layer: "synthesis", inheritable: true, type: "book" },
      ],
    },
    { title: "Review", layer: "review", inheritable: true, type: "book" },
    {
      title: "Index",
      layer: "index",
      inheritable: false,
      type: "text",
      template: "<h1>Index</h1><p>(one line per page: link — summary — #status)</p>",
    },
    { title: "Log", layer: "log", inheritable: false, type: "text", template: "<h1>Log</h1>" },
  ],
};

export type LogOp = "ingest" | "query" | "lint" | "delete" | "session";

export interface LogEntry {
  date: string; // YYYY-MM-DD
  op: LogOp;
  title: string;
}

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

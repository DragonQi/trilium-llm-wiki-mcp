import type { EtapiClient } from "../etapi/client.js";
import type { Attribute } from "../etapi/types.js";
import type { GraphOpts, LocalGraphData, NodeMeta, WikiType } from "./types.js";

const DEFAULTS = { maxNodes: 150, maxPerNode: 25 };

function wikiTypeOf(attrs: Attribute[]): WikiType {
  const t = attrs.find((a) => a.type === "label" && a.name === "wikiType")?.value;
  return (t as WikiType) ?? "unknown";
}

function relationTargets(attrs: Attribute[]): { name: string; target: string }[] {
  return attrs
    .filter((a) => a.type === "relation")
    .map((a) => ({ name: a.name, target: a.value }));
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
    for (const noteId of frontier) {
      if (nodes.size >= maxNodes) {
        truncated = true;
        break;
      }
      const note = noteId === seedNoteId ? seed : await client.getNote(noteId);
      ensureMeta(noteId, note.title, note.attributes);
      const allRels = relationTargets(note.attributes);
      const rels = allRels.slice(0, maxPerNode);
      if (allRels.length > maxPerNode) truncated = true;
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

import { describe, it, expect } from "vitest";
import { directLink, sourceOverlap, adamicAdar, typeAffinityScore } from "../../../src/graph/signals.js";
import type { LocalGraphData, NodeMeta, WikiType } from "../../../src/graph/types.js";

function node(noteId: string, wikiType: WikiType, derived: string[] = []): NodeMeta {
  return { noteId, title: noteId, wikiType, derivedFromTargets: new Set(derived) };
}

function data(seed: string, nodes: NodeMeta[], edges: [string, string][]): LocalGraphData {
  const nodeMap = new Map(nodes.map((n) => [n.noteId, n]));
  const neighbors = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  for (const n of nodes) {
    neighbors.set(n.noteId, new Set());
    degree.set(n.noteId, 0);
  }
  for (const [a, b] of edges) {
    if (a === b) continue;
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  return { seedNoteId: seed, nodes: nodeMap, neighbors, degree, truncated: false };
}

describe("signals", () => {
  it("directLink is 1 for a neighbor, 0 otherwise", () => {
    const d = data("seed", [node("seed", "concept"), node("a", "entity"), node("b", "entity")], [
      ["seed", "a"],
    ]);
    expect(directLink(d, "a")).toBe(1);
    expect(directLink(d, "b")).toBe(0);
  });

  it("sourceOverlap counts shared derivedFrom targets", () => {
    const seed = node("seed", "concept", ["s1", "s2"]);
    const cand = node("c", "entity", ["s2", "s3"]);
    expect(sourceOverlap(seed, cand)).toBe(1);
    expect(sourceOverlap(seed, node("x", "entity", []))).toBe(0);
  });

  it("adamicAdar sums 1/log(degree) over common neighbors", () => {
    // seed--n--c (n is common neighbor, degree 2); n degree 2 -> 1/ln(2)
    const d = data(
      "seed",
      [node("seed", "concept"), node("c", "entity"), node("n", "entity")],
      [
        ["seed", "n"],
        ["c", "n"],
      ],
    );
    expect(adamicAdar(d, "c")).toBeCloseTo(1 / Math.log(2), 5);
  });

  it("typeAffinityScore uses the matrix", () => {
    expect(typeAffinityScore(node("a", "concept"), node("b", "entity"))).toBe(0.6);
    expect(typeAffinityScore(node("a", "entity"), node("b", "entity"))).toBe(1.0);
  });
});

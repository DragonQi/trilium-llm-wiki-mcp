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

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

export function typeAffinityScore(seed: NodeMeta, candidate: NodeMeta): number {
  return affinity(seed.wikiType, candidate.wikiType);
}

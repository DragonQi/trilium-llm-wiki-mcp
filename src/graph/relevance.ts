import { buildLocalGraph } from "./builder.js";
import { adamicAdar, directLink, sourceOverlap, typeAffinityScore } from "./signals.js";
import type { FindRelatedOpts, ScoredNote, SignalScores } from "./types.js";
import type { EtapiClient } from "../etapi/client.js";

const WEIGHTS = { directLink: 3, sourceOverlap: 4, adamicAdar: 1.5, typeAffinity: 1 };
const DEFAULT_MAX_RESULTS = 15;

export async function findRelated(
  client: EtapiClient,
  seedNoteId: string,
  opts: FindRelatedOpts = {},
): Promise<{ scores: ScoredNote[]; truncated: boolean }> {
  const data = await buildLocalGraph(client, seedNoteId, opts);
  const seed = data.nodes.get(seedNoteId);
  if (!seed) return { scores: [], truncated: data.truncated };
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;

  const scored: ScoredNote[] = [];
  for (const [candidateId, meta] of data.nodes) {
    if (candidateId === seedNoteId) continue;
    const signals: SignalScores = {
      directLink: directLink(data, candidateId),
      sourceOverlap: sourceOverlap(seed, meta),
      adamicAdar: adamicAdar(data, candidateId),
      typeAffinity: typeAffinityScore(seed, meta),
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

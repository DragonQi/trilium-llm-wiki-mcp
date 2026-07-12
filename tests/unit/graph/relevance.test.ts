import { describe, it, expect } from "vitest";
import { findRelated } from "../../../src/graph/relevance.js";
import { mockClient } from "../../helpers/mockClient.js";

describe("findRelated", () => {
  it("excludes the seed and ranks a direct neighbor with positive score", async () => {
    const client = mockClient();
    client.getNote.mockImplementation(async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notes: Record<string, any> = {
        seed: {
          noteId: "seed",
          title: "Seed",
          attributes: [
            { type: "relation", name: "relatesTo", value: "a" },
            { type: "label", name: "wikiType", value: "concept" },
          ],
        },
        a: {
          noteId: "a",
          title: "A",
          attributes: [
            { type: "relation", name: "relatesTo", value: "b" },
            { type: "label", name: "wikiType", value: "entity" },
          ],
        },
        b: { noteId: "b", title: "B", attributes: [] },
      };
      return notes[id];
    });
    const { scores, truncated } = await findRelated(client, "seed", { maxNodes: 50 });
    expect(scores.find((s) => s.noteId === "seed")).toBeUndefined();
    const a = scores.find((s) => s.noteId === "a");
    expect(a).toBeTruthy();
    expect(a!.compositeScore).toBeGreaterThan(0);
    // direct neighbor 'a' must include a directLink signal of 1
    expect(a!.signals.directLink).toBe(1);
    expect(truncated).toBe(false);
    // scores sorted descending
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]!.compositeScore).toBeGreaterThanOrEqual(scores[i]!.compositeScore);
    }
  });
});

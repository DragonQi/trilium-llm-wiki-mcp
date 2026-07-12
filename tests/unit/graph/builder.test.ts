import { describe, it, expect } from "vitest";
import { buildLocalGraph } from "../../../src/graph/builder.js";
import { mockClient } from "../../helpers/mockClient.js";

describe("buildLocalGraph", () => {
  it("walks 2 hops and captures derivedFrom + neighbors", async () => {
    const client = mockClient();
    client.getNote.mockImplementation(async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notes: Record<string, any> = {
        seed: {
          noteId: "seed",
          title: "Seed",
          attributes: [
            { type: "relation", name: "relatesTo", value: "a" },
            { type: "relation", name: "derivedFrom", value: "src1" },
            { type: "label", name: "wikiType", value: "concept" },
          ],
        },
        a: { noteId: "a", title: "A", attributes: [{ type: "relation", name: "relatesTo", value: "b" }] },
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

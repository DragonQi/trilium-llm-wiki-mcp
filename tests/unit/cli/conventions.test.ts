import { describe, it, expect } from "vitest";
import { VAULT_STRUCTURE, VAULT_ROOT_TITLE } from "../../../src/cli/conventions.js";

describe("VAULT_STRUCTURE", () => {
  it("root is the LLM Wiki book", () => {
    expect(VAULT_STRUCTURE.title).toBe(VAULT_ROOT_TITLE);
    expect(VAULT_STRUCTURE.type).toBe("book");
  });

  it("Wiki has 7 layer children", () => {
    const wiki = VAULT_STRUCTURE.children!.find((c) => c.title === "Wiki")!;
    expect(wiki.children).toHaveLength(7);
    expect(wiki.children!.map((c) => c.title).sort()).toEqual(
      ["Comparisons", "Concepts", "Entities", "Overview", "Queries", "Summaries", "Synthesis"],
    );
  });

  it("containers are inheritable, special files are text", () => {
    const raw = VAULT_STRUCTURE.children!.find((c) => c.title === "Raw")!;
    expect(raw.inheritable).toBe(true);
    for (const t of ["Purpose", "Index", "Log"]) {
      const node = VAULT_STRUCTURE.children!.find((c) => c.title === t)!;
      expect(node.type).toBe("text");
      expect(node.template).toBeTruthy();
    }
  });
});

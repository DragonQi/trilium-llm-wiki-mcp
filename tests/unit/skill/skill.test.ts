import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skillDir = resolve(root, "skill");
const skillPath = resolve(skillDir, "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

function parseFrontmatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(md);
  const fm: Record<string, string> = {};
  if (m) {
    for (const line of m[1]!.split("\n")) {
      const mm = /^(\w+):\s*(.*)$/.exec(line);
      if (mm) fm[mm[1]!] = mm[2]!;
    }
  }
  return fm;
}

describe("trilium-wiki SKILL", () => {
  it("SKILL.md exists with valid frontmatter", () => {
    const fm = parseFrontmatter(skill);
    expect(fm.name).toBe("trilium-wiki");
    expect(fm.description).toBeTruthy();
    // frontmatter must stay under the 1024-char spec limit
    expect(skill.slice(0, skill.indexOf("---", 4)).length).toBeLessThan(1100);
  });

  it("description starts with 'Use when' and carries trigger discipline", () => {
    const fm = parseFrontmatter(skill);
    expect(fm.description).toMatch(/^Use when/);
    // must NOT trigger on unrelated tools
    expect(fm.description).toContain("Obsidian");
    expect(fm.description).toContain("ask");
  });

  it("references all four operation guides", () => {
    for (const f of ["ingest", "query", "lint", "delete"]) {
      expect(existsSync(resolve(skillDir, "references", `${f}.md`))).toBe(true);
      expect(skill).toContain(`references/${f}.md`);
    }
  });

  it("mentions the core MCP tools (so the agent knows its hands)", () => {
    const tools = [
      "query_wiki", "find_related", "upsert_note", "get_note_content",
      "search_by_attribute", "find_orphans", "get_backlinks", "set_attribute",
      "create_note", "delete_note", "replace_note_section", "append_to_note",
      "search_notes", "get_app_info", "get_attributes",
    ];
    for (const t of tools) expect(skill).toContain(t);
  });

  it("encodes the critical hard rules", () => {
    expect(skill).toContain("Map, not bodies");
    expect(skill).toContain("#status");
    expect(skill).toContain("Drift");
    expect(skill).toContain("Search before create");
  });
});

import { describe, it, expect } from "vitest";
import { formatLogEntry, parseLogEntries, today } from "../../../src/cli/format.js";

describe("format", () => {
  it("formatLogEntry renders the canonical line", () => {
    expect(formatLogEntry({ date: "2026-07-12", op: "ingest", title: "Foo" })).toBe(
      "## [2026-07-12] ingest | Foo",
    );
  });

  it("parseLogEntries round-trips and trims title", () => {
    const html = `<h1>Log</h1>\n## [2026-07-12] query | bar \n## [2026-07-11] lint | baz`;
    expect(parseLogEntries(html)).toEqual([
      { date: "2026-07-12", op: "query", title: "bar" },
      { date: "2026-07-11", op: "lint", title: "baz" },
    ]);
  });

  it("ignores non-entry lines", () => {
    expect(parseLogEntries("<h1>Log</h1>\n<p>noise</p>")).toEqual([]);
  });

  it("today returns YYYY-MM-DD", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

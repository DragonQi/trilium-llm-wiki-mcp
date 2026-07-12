import { describe, it, expect } from "vitest";
import { EtapiError, toolError, asToolResult } from "../../../src/lib/errors.js";

describe("EtapiError", () => {
  it("carries status + code", () => {
    const e = new EtapiError({ status: 404, code: "NOTE_NOT_FOUND", message: "nope" });
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOTE_NOT_FOUND");
    expect(e.message).toBe("nope");
    expect(e instanceof Error).toBe(true);
  });
});

describe("toolError", () => {
  it("returns an isError result", () => {
    expect(toolError("boom")).toEqual({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
  });
});

describe("asToolResult", () => {
  it("stringifies success", async () => {
    const r = await asToolResult(() => Promise.resolve({ a: 1 }), (v) => JSON.stringify(v));
    expect(r).toEqual({ content: [{ type: "text", text: '{"a":1}' }] });
  });

  it("maps EtapiError to isError with code hint", async () => {
    const r = await asToolResult(
      () =>
        Promise.reject(new EtapiError({ status: 404, code: "NOTE_NOT_FOUND", message: "missing" })),
      JSON.stringify,
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("NOTE_NOT_FOUND");
    expect((r.content[0] as { text: string }).text).toContain("missing");
  });

  it("maps 5xx with retry hint", async () => {
    const r = await asToolResult(
      () => Promise.reject(new EtapiError({ status: 503, code: "GENERIC", message: "down" })),
      JSON.stringify,
    );
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("retry");
  });

  it("maps generic Error to isError", async () => {
    const r = await asToolResult(() => Promise.reject(new Error("oops")), JSON.stringify);
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("oops");
  });
});

import { describe, it, expect } from "vitest";
import { loadConfig } from "../../../src/lib/config.js";

describe("loadConfig", () => {
  it("parses required + optional fields with defaults", () => {
    const cfg = loadConfig({ TRILIUM_URL: "http://localhost:8080/", TRILIUM_TOKEN: "abc" });
    expect(cfg).toEqual({ url: "http://localhost:8080", token: "abc", timeoutMs: 30000, verifyTls: true });
  });

  it("respects optional overrides", () => {
    const cfg = loadConfig({
      TRILIUM_URL: "https://t.example.com",
      TRILIUM_TOKEN: "x",
      TRILIUM_TIMEOUT: "5000",
      TRILIUM_VERIFY_TLS: "0",
    });
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.verifyTls).toBe(false);
  });

  it("throws on missing url", () => {
    expect(() => loadConfig({ TRILIUM_TOKEN: "x" })).toThrow(/TRILIUM_URL/);
  });

  it("throws on missing token", () => {
    expect(() => loadConfig({ TRILIUM_URL: "http://x" })).toThrow(/TRILIUM_TOKEN/);
  });
});

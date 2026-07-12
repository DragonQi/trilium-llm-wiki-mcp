import { describe, it, expect } from "vitest";
import { affinity } from "../../../src/graph/type-affinity.js";

describe("affinity", () => {
  it("is 1.0 for same type", () => {
    expect(affinity("entity", "entity")).toBe(1.0);
  });
  it("concept/entity = 0.6 (symmetric)", () => {
    expect(affinity("concept", "entity")).toBe(0.6);
    expect(affinity("entity", "concept")).toBe(0.6);
  });
  it("overview with anything = 0.5", () => {
    expect(affinity("overview", "entity")).toBe(0.5);
    expect(affinity("concept", "overview")).toBe(0.5);
  });
  it("synthesis/concept = 0.5", () => {
    expect(affinity("synthesis", "concept")).toBe(0.5);
  });
  it("unknown falls back to 0.3", () => {
    expect(affinity("unknown", "concept")).toBe(0.3);
  });
  it("unrelated pair = 0.1", () => {
    expect(affinity("raw", "log")).toBe(0.1);
  });
});

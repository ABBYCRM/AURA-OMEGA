/**
 * Mem0 helpers — vitest tests (DB-free).
 *
 * Covers the JSON parser and confidence clamping.
 */

import { describe, it, expect } from "vitest";
import { parseExtractResponse } from "./extractor";

describe("mem0 parseExtractResponse", () => {
  it("parses plain JSON", () => {
    const raw = JSON.stringify({
      facts: [
        { category: "preference", entity: "deploy cadence", attribute: "frequency", value: "daily", confidence: 0.8 },
      ],
    });
    const out = parseExtractResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("preference");
    expect(out[0].confidence).toBe(0.8);
  });

  it("parses fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      facts: [
        { category: "entity", entity: "github.com", attribute: "username", value: "abbycrm", confidence: 0.9 },
      ],
    }) + "\n```";
    const out = parseExtractResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].entity).toBe("github.com");
  });

  it("clamps confidence to [0,1]", () => {
    const raw = JSON.stringify({
      facts: [{ category: "topic", entity: "x", attribute: "y", value: "z", confidence: 5 }],
    });
    const out = parseExtractResponse(raw);
    expect(out[0].confidence).toBe(1);
  });

  it("rejects invalid categories", () => {
    const raw = JSON.stringify({
      facts: [{ category: "made_up", entity: "x", attribute: "y", value: "z", confidence: 0.5 }],
    });
    expect(parseExtractResponse(raw)).toEqual([]);
  });

  it("returns empty array when no facts", () => {
    const raw = JSON.stringify({ facts: [] });
    expect(parseExtractResponse(raw)).toEqual([]);
  });

  it("caps at 5 facts", () => {
    const facts = Array.from({ length: 10 }, (_, i) => ({
      category: "context",
      entity: `e${i}`,
      attribute: `a${i}`,
      value: `v${i}`,
      confidence: 0.5,
    }));
    const raw = JSON.stringify({ facts });
    expect(parseExtractResponse(raw)).toHaveLength(5);
  });

  it("returns empty for garbage input", () => {
    expect(parseExtractResponse("")).toEqual([]);
    expect(parseExtractResponse("not json")).toEqual([]);
  });
});

describe("confidence clamping", () => {
  function clamp(c: number): number { return Math.max(0, Math.min(1, c)); }
  it("clamps high", () => expect(clamp(2)).toBe(1));
  it("clamps low", () => expect(clamp(-0.5)).toBe(0));
  it("passes through valid", () => expect(clamp(0.7)).toBe(0.7));
});
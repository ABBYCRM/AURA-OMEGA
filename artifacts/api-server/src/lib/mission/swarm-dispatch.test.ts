import { describe, it, expect } from "vitest";
import { planDimensions } from "./swarm-dispatch";

describe("planDimensions", () => {
  it("returns one dimension per plan step with engine name + action", () => {
    const dims = planDimensions({
      plan: [
        { index: 0, engine: "searxng-search", action: "search", acceptance: ">=0 results" },
        { index: 1, engine: "tavily-search", action: "search", acceptance: ">=0 results" },
        { index: 2, engine: "crawl4ai", action: "crawl", acceptance: ">=1 ok" },
        { index: 3, engine: "brain", action: "synthesize", acceptance: "final answer" },
      ],
    });
    expect(dims).toHaveLength(4);
    expect(dims[0]).toMatchObject({ index: 0, name: "Scout", role: /Search.*results/i, status: "queued", progress: 0 });
    expect(dims[2]).toMatchObject({ index: 2, name: "Crawler", role: /Crawl.*ok/i });
    expect(dims[3]).toMatchObject({ index: 3, name: "Brain", role: /Synthesize.*answer/i });
  });
  it("falls back gracefully for unknown engines", () => {
    const dims = planDimensions({ plan: [{ index: 0, engine: "foo_bar", action: "do-it" }] });
    expect(dims[0].name).toBe("Foo_bar"); // Capitalize first letter
    expect(dims[0].role).toBe("Do it step"); // No acceptance provided, hyphen replaced with space
  });
  it("returns empty array for empty plan", () => {
    expect(planDimensions({ plan: [] })).toEqual([]);
  });
});
/**
 * Crawl4AI helpers — vitest tests (DB-free).
 *
 * Covers the URL extraction logic + outcome classification.
 */

import { describe, it, expect } from "vitest";
import { extractLinksFromMarkdown } from "./runtime";

describe("crawl4ai link extraction", () => {
  it("extracts absolute http(s) links from markdown", () => {
    const md = `[a](https://example.com/page1) [b](https://example.com/page2)`;
    const links = extractLinksFromMarkdown(md, "https://example.com");
    expect(links).toContain("https://example.com/page1");
    expect(links).toContain("https://example.com/page2");
  });

  it("resolves relative links against the base URL", () => {
    const md = "[next](/about) [home](../)";
    const links = extractLinksFromMarkdown(md, "https://example.com/blog/post");
    expect(links.some((l) => l.endsWith("/about"))).toBe(true);
    expect(links.some((l) => l.includes("example.com"))).toBe(true);
  });

  it("dedupes repeated links", () => {
    const md = "[a](https://x.test/p) [b](https://x.test/p) [c](https://x.test/p)";
    const links = extractLinksFromMarkdown(md, "https://x.test");
    expect(links.filter((l) => l === "https://x.test/p")).toHaveLength(1);
  });

  it("ignores non-http schemes", () => {
    const md = "[js](javascript:void(0)) [mailto](mailto:a@b.c) [ok](https://x.test/p)";
    const links = extractLinksFromMarkdown(md, "https://x.test");
    expect(links).toEqual(["https://x.test/p"]);
  });

  it("returns empty for plain text without links", () => {
    expect(extractLinksFromMarkdown("just words here", "https://x.test")).toEqual([]);
  });
});

describe("crawl4ai outcome classification", () => {
  function classify(success: number, fail: number): "success" | "partial" | "failed" {
    if (fail === 0 && success > 0) return "success";
    if (success === 0 && fail > 0) return "failed";
    if (success === 0 && fail === 0) return "success"; // zero-page crawl = no-op success
    return "partial";
  }
  it("all-success -> success", () => expect(classify(5, 0)).toBe("success"));
  it("all-fail -> failed", () => expect(classify(0, 5)).toBe("failed"));
  it("mixed -> partial", () => expect(classify(3, 1)).toBe("partial"));
});
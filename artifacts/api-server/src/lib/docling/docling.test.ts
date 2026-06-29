/**
 * Docling helpers — vitest tests (DB-free).
 *
 * Covers format detection + HTML stripper.
 */

import { describe, it, expect } from "vitest";
import { detectFormat, parseDocument } from "./parsers";

describe("docling format detection", () => {
  it("detects HTML by mime", () => {
    expect(detectFormat("text/html", null, "")).toBe("html");
  });
  it("detects HTML by content", () => {
    expect(detectFormat(null, null, "<html><body><h1>x</h1></body></html>")).toBe("html");
  });
  it("detects PDF by extension", () => {
    expect(detectFormat(null, "https://x.test/doc.pdf")).toBe("pdf");
  });
  it("detects DOCX by extension", () => {
    expect(detectFormat(null, "https://x.test/file.docx")).toBe("docx");
  });
  it("detects XLSX by extension", () => {
    expect(detectFormat(null, "https://x.test/sheet.xlsx")).toBe("xlsx");
  });
  it("detects Markdown by content", () => {
    expect(detectFormat(null, null, "# Title\n\n[link](https://x.test)")).toBe("md");
  });
  it("returns unknown for unrecognized content", () => {
    expect(detectFormat(null, null, "just some plain text without any signals")).toBe("txt");
  });
});

describe("docling HTML parser", () => {
  it("extracts prose and drops scripts/styles", async () => {
    const html = `<html><head><script>alert(1)</script><style>body{color:red}</style></head>
<body><h1>Title</h1><p>Hello <b>world</b></p><script>nope()</script>
<a href="/x">link</a></body></html>`;
    const out = await parseDocument({ rawBytes: html, mimeType: "text/html", url: null });
    expect(out.format).toBe("html");
    expect(out.text).toContain("Title");
    expect(out.text).toContain("Hello world");
    expect(out.text).toContain("link");
    expect(out.text).not.toContain("alert");
    expect(out.text).not.toContain("color:red");
    expect(out.text).not.toContain("nope()");
  });

  it("decodes common HTML entities", async () => {
    const html = `<p>Tom &amp; Jerry &lt;3 &quot;pasta&quot;</p>`;
    const out = await parseDocument({ rawBytes: html, mimeType: "text/html" });
    expect(out.text).toContain("Tom & Jerry <3 \"pasta\"");
  });

  it("inserts newlines at block boundaries", async () => {
    const html = "<div>a</div><div>b</div><p>c</p>";
    const out = await parseDocument({ rawBytes: html, mimeType: "text/html" });
    expect(out.text.split("\n").length).toBeGreaterThan(1);
  });
});

describe("docling markdown parser", () => {
  it("strips inline marks but keeps text", async () => {
    const md = "# Heading\n\nThis is **bold** and *italic* with `code`.";
    const out = await parseDocument({ rawBytes: md, mimeType: "text/markdown" });
    expect(out.format).toBe("md");
    expect(out.text).toContain("Heading");
    expect(out.text).toContain("This is bold and italic with code.");
  });

  it("expands links to labels", async () => {
    const md = "Click [here](https://example.com) please.";
    const out = await parseDocument({ rawBytes: md });
    expect(out.text).toContain("Click here please.");
  });
});

describe("docling PDF/DOCX/XLSX graceful failure", () => {
  it("PDF parser returns install hint when deps missing", async () => {
    const out = await parseDocument({ rawBytes: "fake", mimeType: "application/pdf" });
    expect(out.format).toBe("pdf");
    expect(out.metadata.error).toContain("pdf-parse is not installed");
  });
  it("DOCX parser returns install hint", async () => {
    const out = await parseDocument({ rawBytes: "fake", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(out.format).toBe("docx");
    expect(out.metadata.error).toContain("mammoth is not installed");
  });
  it("XLSX parser returns install hint", async () => {
    const out = await parseDocument({ rawBytes: "fake", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(out.format).toBe("xlsx");
    expect(out.metadata.error).toContain("xlsx is not installed");
  });
});
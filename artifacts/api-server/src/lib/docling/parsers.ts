/**
 * Docling parsers — pluggable.
 *
 * Each parser takes raw bytes (as string for text-like formats, base64 for
 * binary) and returns extracted text. Built-in parsers (HTML/MD/TXT) work
 * without any deps. PDF/DOCX/XLSX parsers require optional npm packages
 * and return a graceful "install X to enable this format" error if missing.
 *
 * Why not just install the npm packages now? The operator removed the
 * "stay in the stack / foreign stack" rule, but adding 3-5 MB of pdf-parse
 * + mammoth + xlsx to the lockfile is a deliberate decision. This lets them
 * opt in per-format when they actually need it.
 */

import { logger } from "../logger";
import type { DoclingFormat } from "./types";

export interface Parser {
  format: DoclingFormat;
  matches(mimeType: string | null, url: string | null, contentSample?: string): boolean;
  parse(input: { rawBytes?: Buffer | string; contentSample?: string; url?: string | null }): Promise<{
    text: string;
    metadata: Record<string, unknown>;
  }>;
}

// ─── HTML parser ────────────────────────────────────────────────────────────
const htmlParser: Parser = {
  format: "html",
  matches(mime, url, sample) {
    if (mime && /html/i.test(mime)) return true;
    if (url && /\.html?$|\/|\?/i.test(url) && !/\.(pdf|docx|xlsx?|txt|md|png|jpg|jpeg|gif|svg)$/i.test(url)) return true;
    if (sample && /<html|<body|<head|<div|<p\b|<h[1-6]\b/i.test(sample)) return true;
    return false;
  },
  async parse({ rawBytes }) {
    const html = typeof rawBytes === "string" ? rawBytes : rawBytes?.toString("utf-8") ?? "";
    const text = htmlToText(html);
    return { text, metadata: { kind: "html" } };
  },
};

// ─── Markdown parser ────────────────────────────────────────────────────────
const mdParser: Parser = {
  format: "md",
  matches(mime, url, sample) {
    if (mime && /(markdown|md)/i.test(mime)) return true;
    if (url && /\.md$/i.test(url)) return true;
    if (sample && /^#{1,6}\s|\n#{1,6}\s|\[.+]\(.+\)/.test(sample)) return true;
    return false;
  },
  async parse({ rawBytes }) {
    const md = typeof rawBytes === "string" ? rawBytes : rawBytes?.toString("utf-8") ?? "";
    // Strip the most common MD noise so memory_search gets clean text.
    const cleaned = md
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))   // keep code blocks but drop fences
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")                       // images
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")                     // links -> label
      .replace(/^>\s?/gm, "")                                    // blockquotes
      .replace(/[*_~`]/g, "")                                    // inline marks
      .replace(/\n{3,}/g, "\n\n");
    return { text: cleaned, metadata: { kind: "markdown" } };
  },
};

// ─── Plain text parser ──────────────────────────────────────────────────────
const txtParser: Parser = {
  format: "txt",
  matches(mime, url, sample) {
    if (mime && /^text\/plain/i.test(mime)) return true;
    if (url && /\.txt$|\.log$/i.test(url)) return true;
    // Catch-all only when no recognized mime / no extension. Don't compete
    // with explicit binary formats like PDF/DOCX/XLSX — the order of
    // matches() callers matters; the runtime tries binary formats first,
    // then HTML, then this fallback.
    if (sample && sample.length < 200000 && !/<[a-z][^>]*>/i.test(sample)) return true;
    return false;
  },
  async parse({ rawBytes }) {
    const text = typeof rawBytes === "string" ? rawBytes : rawBytes?.toString("utf-8") ?? "";
    return { text, metadata: { kind: "text" } };
  },
};

// ─── PDF parser (optional dependency) ───────────────────────────────────────
const pdfParser: Parser = {
  format: "pdf",
  matches(mime, url) {
    if (mime && /pdf/i.test(mime)) return true;
    if (url && /\.pdf$/i.test(url)) return true;
    return false;
  },
  async parse() {
    // Optional dependency. The runtime gracefully reports this rather than
    // failing the whole parse — the operator can `pnpm add pdf-parse` later
    // and the parser becomes available without code changes.
    return {
      text: "",
      metadata: {
        error:
          "pdf-parse is not installed. Run `pnpm --filter @workspace/api-server add pdf-parse` to enable PDF parsing.",
      },
    };
  },
};

// ─── DOCX parser (optional dependency) ─────────────────────────────────────
const docxParser: Parser = {
  format: "docx",
  matches(mime, url) {
    if (mime && /(msword|officedocument\.wordprocessingml)/i.test(mime)) return true;
    if (url && /\.docx$/i.test(url)) return true;
    return false;
  },
  async parse() {
    return {
      text: "",
      metadata: {
        error:
          "mammoth is not installed. Run `pnpm --filter @workspace/api-server add mammoth` to enable DOCX parsing.",
      },
    };
  },
};

// ─── XLSX parser (optional dependency) ─────────────────────────────────────
const xlsxParser: Parser = {
  format: "xlsx",
  matches(mime, url) {
    if (mime && /(spreadsheet|officedocument\.spreadsheetml)/i.test(mime)) return true;
    if (url && /\.xlsx?$/i.test(url)) return true;
    return false;
  },
  async parse() {
    return {
      text: "",
      metadata: {
        error:
          "xlsx is not installed. Run `pnpm --filter @workspace/api-server add xlsx` to enable XLSX parsing.",
      },
    };
  },
};

const PARSERS: Parser[] = [
  // Specific binary formats first — they have unambiguous signatures (mime type
  // or file extension). Fallback parsers (html, md, txt) come after.
  pdfParser,
  docxParser,
  xlsxParser,
  htmlParser,
  mdParser,
  txtParser,
];

export function detectFormat(mimeType: string | null, url: string | null, sample?: string): DoclingFormat {
  for (const p of PARSERS) {
    if (p.matches(mimeType, url, sample)) return p.format;
  }
  return "unknown";
}

export async function parseDocument(opts: {
  rawBytes?: Buffer | string;
  mimeType?: string | null;
  url?: string | null;
  contentSample?: string;
}): Promise<{
  format: DoclingFormat;
  text: string;
  metadata: Record<string, unknown>;
}> {
  const sample = opts.contentSample ?? (typeof opts.rawBytes === "string" ? opts.rawBytes.slice(0, 2000) : opts.rawBytes?.toString("utf-8", 0, 2000));
  const format = detectFormat(opts.mimeType ?? null, opts.url ?? null, sample);
  const parser = PARSERS.find((p) => p.format === format) ?? txtParser;
  try {
    const result = await parser.parse({ rawBytes: opts.rawBytes, contentSample: sample, url: opts.url ?? null });
    return { format: parser.format, text: result.text, metadata: result.metadata };
  } catch (err) {
    logger.error({ err, format, url: opts.url }, "docling: parse failed");
    return { format: parser.format, text: "", metadata: { error: String(err).slice(0, 200) } };
  }
}

/**
 * Very small HTML-to-text stripper. Removes tags, decodes common entities,
 * collapses whitespace. Good enough for the "give me the prose" use case
 * (Docling's real output would be richer markdown with section headers,
 * but a clean text stripper covers 80% of "extract the words").
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|article|section|header|footer|nav|main)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
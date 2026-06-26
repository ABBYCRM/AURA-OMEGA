/**
 * Docling runtime — types.
 *
 * Docling (docling-project/docling) is integrated as a document-parser
 * runtime. The Python Docling lib itself can't run in Node, so we
 * implement a pluggable parser registry:
 *
 *   - Built-in parsers for HTML, Markdown, plain text — work out of the box.
 *   - Optional parsers for PDF / DOCX / XLSX — require the corresponding
 *     npm packages to be installed by the operator. If not installed, the
 *     parser returns a graceful error explaining what to install.
 *
 * Extracted text is persisted to docling_documents AND, when requested,
 * written into the existing agent_memory table so memory_search can
 * retrieve it.
 */

export type DoclingSourceKind = "url" | "upload" | "text";
export type DoclingFormat = "pdf" | "docx" | "xlsx" | "html" | "md" | "txt" | "rtf" | "image" | "unknown";

export interface ParseRequest {
  title?: string;
  sourceKind: DoclingSourceKind;
  sourceRef?: string | null;
  rawContent?: string | null;
  mimeType?: string | null;
  /** If true, also write the extracted text into agent_memory. */
  writeToMemory?: boolean;
  memoryKey?: string | null;
  memoryTag?: string;
}

export interface ParseResult {
  format: DoclingFormat;
  bytes: number;
  extractedChars: number;
  extractedText: string;
  metadata: Record<string, unknown>;
}
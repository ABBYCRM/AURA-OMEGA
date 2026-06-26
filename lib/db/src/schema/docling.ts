import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Docling runtime — documents schema.
 *
 * One row per parsed document. Source can be a URL, an upload ID, or a raw
 * text snippet. Extracted text is persisted so future memory_search queries
 * can retrieve it (we also write into agent_memory for parity with crawl4ai).
 *
 * Idempotent migration.
 */

export const doclingDocumentsTable = pgTable(
  "docling_documents",
  {
    id: serial("id").primaryKey(),
    title: text("title"),
    /** Source kind: url | upload | text */
    sourceKind: text("source_kind").notNull(),
    /** For url: the URL. For upload: the attachment ID. For text: NULL. */
    sourceRef: text("source_ref"),
    /** Detected MIME type, e.g. "application/pdf", "text/html". */
    mimeType: text("mime_type"),
    /** Format label that the parser matched, e.g. "pdf", "docx", "html", "md", "txt". */
    format: text("format").notNull(),
    /** Total bytes of the source. */
    bytes: integer("bytes"),
    /** Extracted plain text / markdown. Truncated to a reasonable size on write. */
    extractedText: text("extracted_text"),
    /** Length of the extracted text (chars). */
    extractedChars: integer("extracted_chars").notNull().default(0),
    /** Optional structured metadata (page count, language, sections). */
    metadata: jsonb("metadata").notNull().default({}),
    status: text("status").notNull().default("success"),
    error: text("error"),
    parsedAt: timestamp("parsed_at").notNull().defaultNow(),
  },
  (t) => ({
    formatIdx: index("docling_documents_format_idx").on(t.format),
    parsedIdx: index("docling_documents_parsed_idx").on(t.parsedAt),
  }),
);

export const insertDoclingDocumentSchema = createInsertSchema(doclingDocumentsTable).omit({
  id: true,
  parsedAt: true,
});
export type DoclingDocument = typeof doclingDocumentsTable.$inferSelect;
export type InsertDoclingDocument = z.infer<typeof insertDoclingDocumentSchema>;

export type DoclingSourceKind = "url" | "upload" | "text";
export type DoclingFormat = "pdf" | "docx" | "xlsx" | "html" | "md" | "txt" | "rtf" | "image" | "unknown";
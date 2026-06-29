/**
 * Docling runtime — public surface.
 */

export { parseDocument, detectFormat } from "./parsers";
export { parseAndRecord } from "./runtime";
export { recordDocument, listDocuments, getDocumentById, stats } from "./store";
export type { ParseRequest, ParseResult, DoclingSourceKind, DoclingFormat } from "./types";
/**
 * Docling storage — document row CRUD.
 */

import { db } from "@workspace/db";
import {
  doclingDocumentsTable,
  type DoclingDocument,
} from "@workspace/db";
import { eq, desc, sql, count } from "drizzle-orm";
import { logger } from "../logger";
import type { DoclingFormat } from "./types";

export interface RecordDocumentInput {
  title?: string | null;
  sourceKind: "url" | "upload" | "text";
  sourceRef?: string | null;
  mimeType?: string | null;
  format: DoclingFormat;
  bytes?: number | null;
  extractedText?: string | null;
  metadata?: Record<string, unknown>;
  status?: "success" | "failed";
  error?: string | null;
}

export async function recordDocument(input: RecordDocumentInput): Promise<DoclingDocument | null> {
  try {
    const extractedChars = (input.extractedText ?? "").length;
    const [row] = await db
      .insert(doclingDocumentsTable)
      .values({
        title: input.title ?? null,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef ?? null,
        mimeType: input.mimeType ?? null,
        format: input.format,
        bytes: input.bytes ?? null,
        extractedText: (input.extractedText ?? "").slice(0, 100000),
        extractedChars,
        metadata: (input.metadata ?? {}) as object,
        status: input.status ?? "success",
        error: input.error ?? null,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "docling: recordDocument failed");
    return null;
  }
}

export async function listDocuments(limit = 50): Promise<DoclingDocument[]> {
  try {
    return await db
      .select()
      .from(doclingDocumentsTable)
      .orderBy(desc(doclingDocumentsTable.parsedAt))
      .limit(limit);
  } catch (err) {
    logger.error({ err }, "docling: listDocuments failed");
    return [];
  }
}

export async function getDocumentById(id: number): Promise<DoclingDocument | null> {
  try {
    const [row] = await db
      .select()
      .from(doclingDocumentsTable)
      .where(eq(doclingDocumentsTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err, id }, "docling: getDocumentById failed");
    return null;
  }
}

export async function stats(): Promise<{
  total: number;
  byFormat: Record<string, number>;
}> {
  try {
    const rows = await db
      .select({
        format: doclingDocumentsTable.format,
        total: sql<number>`COUNT(*)`,
      })
      .from(doclingDocumentsTable)
      .groupBy(doclingDocumentsTable.format);
    const totalRow = await db.select({ total: sql<number>`COUNT(*)` }).from(doclingDocumentsTable);
    const byFormat: Record<string, number> = {};
    for (const r of rows) byFormat[r.format] = Number(r.total);
    return { total: Number(totalRow[0]?.total ?? 0), byFormat };
  } catch (err) {
    logger.error({ err }, "docling: stats failed");
    return { total: 0, byFormat: {} };
  }
}
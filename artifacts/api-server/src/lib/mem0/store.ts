/**
 * Mem0 facts — CRUD.
 *
 * Best-effort writes; failures are logged, never thrown. Facts use a
 * (userId, entity, attribute) tuple as a soft unique key — duplicate
 * (entity, attribute) updates the existing fact rather than creating a
 * second row.
 */

import { db } from "@workspace/db";
import { mem0FactsTable, MEM0_CATEGORIES, type Mem0Fact, type Mem0Category } from "@workspace/db";
import { and, eq, sql, desc, like, or } from "drizzle-orm";
import { logger } from "../logger";

export interface UpsertFactInput {
  userId?: string;
  category: Mem0Category;
  entity: string;
  attribute: string;
  value: string;
  confidence?: number;
  sourceMemoryId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function upsertFact(input: UpsertFactInput): Promise<Mem0Fact | null> {
  const userId = input.userId ?? "operator";
  if (!MEM0_CATEGORIES.includes(input.category)) {
    logger.warn({ category: input.category }, "mem0: invalid category");
    return null;
  }
  if (!input.entity.trim() || !input.attribute.trim() || !input.value.trim()) {
    logger.warn({ input }, "mem0: empty entity/attribute/value");
    return null;
  }
  try {
    const confidence = Math.max(0, Math.min(1, input.confidence ?? 0.5));
    // Look for an existing fact for (user, entity, attribute).
    const [existing] = await db
      .select()
      .from(mem0FactsTable)
      .where(
        and(
          eq(mem0FactsTable.userId, userId),
          eq(mem0FactsTable.entity, input.entity),
          eq(mem0FactsTable.attribute, input.attribute),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(mem0FactsTable)
        .set({
          value: input.value,
          category: input.category,
          confidence: Math.max(existing.confidence, confidence),
          sourceMemoryId: input.sourceMemoryId ?? existing.sourceMemoryId,
          metadata: (input.metadata ?? existing.metadata ?? {}) as object,
          reinforcedAt: new Date(),
        })
        .where(eq(mem0FactsTable.id, existing.id))
        .returning();
      return updated ?? null;
    }
    const [row] = await db
      .insert(mem0FactsTable)
      .values({
        userId,
        category: input.category,
        entity: input.entity,
        attribute: input.attribute,
        value: input.value,
        confidence,
        sourceMemoryId: input.sourceMemoryId ?? null,
        metadata: (input.metadata ?? {}) as object,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, input }, "mem0: upsertFact failed");
    return null;
  }
}

export async function listFacts(opts: {
  userId?: string;
  category?: Mem0Category;
  query?: string;
  limit?: number;
} = {}): Promise<Mem0Fact[]> {
  try {
    const userId = opts.userId ?? "operator";
    const filters = [eq(mem0FactsTable.userId, userId)];
    if (opts.category) filters.push(eq(mem0FactsTable.category, opts.category));
    if (opts.query && opts.query.trim()) {
      const needle = `%${opts.query.trim().toLowerCase()}%`;
      filters.push(
        or(
          like(sql`lower(${mem0FactsTable.entity})`, needle),
          like(sql`lower(${mem0FactsTable.attribute})`, needle),
          like(sql`lower(${mem0FactsTable.value})`, needle),
        )!,
      );
    }
    return await db
      .select()
      .from(mem0FactsTable)
      .where(and(...filters))
      .orderBy(desc(mem0FactsTable.confidence), desc(mem0FactsTable.reinforcedAt))
      .limit(opts.limit ?? 100);
  } catch (err) {
    logger.error({ err }, "mem0: listFacts failed");
    return [];
  }
}

export async function deleteFact(id: number): Promise<boolean> {
  try {
    const result = await db
      .delete(mem0FactsTable)
      .where(eq(mem0FactsTable.id, id))
      .returning({ id: mem0FactsTable.id });
    return result.length > 0;
  } catch (err) {
    logger.error({ err, id }, "mem0: deleteFact failed");
    return false;
  }
}

export async function reinforceFact(id: number, delta = 0.05): Promise<Mem0Fact | null> {
  try {
    const [updated] = await db
      .update(mem0FactsTable)
      .set({
        confidence: sql`LEAST(1.0, ${mem0FactsTable.confidence} + ${delta})`,
        reinforcedAt: new Date(),
      })
      .where(eq(mem0FactsTable.id, id))
      .returning();
    return updated ?? null;
  } catch (err) {
    logger.error({ err, id, delta }, "mem0: reinforceFact failed");
    return null;
  }
}

export async function contradictFact(id: number, delta = 0.1): Promise<Mem0Fact | null> {
  try {
    const [updated] = await db
      .update(mem0FactsTable)
      .set({
        confidence: sql`GREATEST(0.0, ${mem0FactsTable.confidence} - ${delta})`,
        reinforcedAt: new Date(),
      })
      .where(eq(mem0FactsTable.id, id))
      .returning();
    return updated ?? null;
  } catch (err) {
    logger.error({ err, id, delta }, "mem0: contradictFact failed");
    return null;
  }
}
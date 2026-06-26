import { pgTable, serial, text, integer, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Mem0 runtime — facts schema.
 *
 * Mem0's value is a USER-FACT MODEL: persistent facts about the operator
 * (preferences, recurring topics, entities they care about). AURA-OMEGA's
 * existing agent_memory table is for general agent state, not facts.
 *
 * This table is intentionally typed (category + entity + attribute + value)
 * so facts can be queried by structure, not just keyword. They also link
 * to the source agent_memory row so facts stay anchored to their evidence.
 *
 * Idempotent migration.
 */

export const mem0FactsTable = pgTable(
  "mem0_facts",
  {
    id: serial("id").primaryKey(),
    /** Stable user/operator identifier. Defaults to "operator" for the single-user mode. */
    userId: text("user_id").notNull().default("operator"),
    /** Categories: preference | entity | topic | behavior | context */
    category: text("category").notNull(),
    /** Subject the fact is about (e.g. "github.com", "operator", "deploy cadence"). */
    entity: text("entity").notNull(),
    /** Attribute of the entity (e.g. "username", "preferred branch", "cadence"). */
    attribute: text("attribute").notNull(),
    /** The fact value as a string. For structured values use metadata. */
    value: text("value").notNull(),
    /** Confidence in [0, 1]. Updates upward on reinforcement, downward on contradiction. */
    confidence: real("confidence").notNull().default(0.5),
    /** Optional pointer to the source agent_memory row this fact was extracted from. */
    sourceMemoryId: integer("source_memory_id"),
    /** Optional LLM-extracted context (e.g. the goal that produced this fact). */
    metadata: jsonb("metadata").notNull().default({}),
    /** Last time this fact was reinforced. */
    reinforcedAt: timestamp("reinforced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userCategoryIdx: index("mem0_facts_user_category_idx").on(t.userId, t.category),
    userEntityAttrIdx: index("mem0_facts_user_entity_attr_idx").on(t.userId, t.entity, t.attribute),
  }),
);

export const insertMem0FactSchema = createInsertSchema(mem0FactsTable).omit({
  id: true,
  reinforcedAt: true,
  createdAt: true,
});

export type Mem0Fact = typeof mem0FactsTable.$inferSelect;
export type InsertMem0Fact = z.infer<typeof insertMem0FactSchema>;

export type Mem0Category = "preference" | "entity" | "topic" | "behavior" | "context";
export const MEM0_CATEGORIES: Mem0Category[] = ["preference", "entity", "topic", "behavior", "context"];
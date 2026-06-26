/**
 * Hermes skill library.
 *
 * Skills are reusable tool-call patterns distilled from prior sessions. Each
 * skill carries a rolling success score (EWMA over hermes_skill_runs rows)
 * so the swarm can prefer high-success skills in future routing decisions.
 *
 * Promotion / retirement thresholds:
 *   - skill starts as 'candidate'
 *   - candidate -> active once success_score >= 0.7 AND runs >= 3
 *   - active -> retired once success_score < 0.3 AND runs >= 5
 *
 * Promotion/retirement happens lazily inside `pruneAndPromote()` (called by
 * the heartbeat) so a hot path doesn't pay the cost on every run.
 */

import { db } from "@workspace/db";
import {
  hermesSkillsTable,
  hermesSkillRunsTable,
  type HermesSkill,
  type InsertHermesSkillRun,
} from "@workspace/db";
import { eq, sql, desc, and, gte, like, or, ilike } from "drizzle-orm";
import { logger } from "../logger";
import type { DistilledSkill, SkillMatch } from "./types";

const PROMOTE_SCORE = 0.7;
const PROMOTE_MIN_RUNS = 3;
const RETIRE_SCORE = 0.3;
const RETIRE_MIN_RUNS = 5;

export async function createSkill(skill: DistilledSkill): Promise<HermesSkill | null> {
  try {
    const [row] = await db
      .insert(hermesSkillsTable)
      .values({
        name: skill.name,
        description: skill.description,
        triggerKeywords: skill.triggerKeywords,
        pattern: skill.pattern as unknown as object,
        preferredAura: skill.preferredAura ?? null,
        sourceSessionId: skill.sourceSessionId ?? null,
        status: "candidate",
        successScore: 0.5,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, name: skill.name }, "hermes: createSkill failed");
    return null;
  }
}

export async function findMatchingSkill(name: string): Promise<HermesSkill | null> {
  try {
    const [row] = await db
      .select()
      .from(hermesSkillsTable)
      .where(eq(hermesSkillsTable.name, name));
    return row ?? null;
  } catch (err) {
    logger.error({ err, name }, "hermes: findMatchingSkill failed");
    return null;
  }
}

export async function listSkills(opts: { status?: string; limit?: number } = {}): Promise<HermesSkill[]> {
  try {
    const where = opts.status ? eq(hermesSkillsTable.status, opts.status) : undefined;
    return await db
      .select()
      .from(hermesSkillsTable)
      .where(where as any)
      .orderBy(desc(hermesSkillsTable.successScore))
      .limit(opts.limit ?? 100);
  } catch (err) {
    logger.error({ err }, "hermes: listSkills failed");
    return [];
  }
}

/**
 * Match a goal string to existing skills.
 *
 * Strategy:
 *   1. Keyword match: any trigger_keyword appears as a whole word in the goal.
 *   2. ILIKE fallback on name/description (cheap).
 * Returns the best match (highest success_score) or null.
 */
export async function matchSkillForGoal(goal: string): Promise<SkillMatch | null> {
  try {
    const needle = `%${goal.toLowerCase().slice(0, 200)}%`;
    const candidates = await db
      .select()
      .from(hermesSkillsTable)
      .where(
        and(
          or(
            sql`${hermesSkillsTable.triggerKeywords} && ARRAY[${goal.toLowerCase().split(/\s+/).filter((w) => w.length >= 4)}]::text[]`,
            ilike(hermesSkillsTable.name, needle),
            ilike(hermesSkillsTable.description, needle),
          ) as any,
          eq(hermesSkillsTable.status, "active"),
        ),
      )
      .orderBy(desc(hermesSkillsTable.successScore))
      .limit(5);
    if (candidates.length === 0) return null;
    const best = candidates[0];
    const reason: SkillMatch["matchReason"] =
      best.triggerKeywords.some((k) => goal.toLowerCase().includes(k)) ? "keyword" : "semantic";
    return {
      skillId: best.id,
      name: best.name,
      description: best.description,
      preferredAura: best.preferredAura ?? null,
      successScore: best.successScore,
      matchReason: reason,
    };
  } catch (err) {
    logger.error({ err }, "hermes: matchSkillForGoal failed");
    return null;
  }
}

export async function recordSkillRun(run: InsertHermesSkillRun): Promise<void> {
  try {
    await db.insert(hermesSkillRunsTable).values(run);
    // Recompute success_score from the last 20 runs (EWMA-ish: simple average is
    // good enough and avoids carrying state across calls).
    const recent = await db
      .select({ success: hermesSkillRunsTable.success })
      .from(hermesSkillRunsTable)
      .where(eq(hermesSkillRunsTable.skillId, run.skillId))
      .orderBy(desc(hermesSkillRunsTable.ranAt))
      .limit(20);
    if (recent.length === 0) return;
    const avg = recent.reduce((acc, r) => acc + (r.success ? 1 : 0), 0) / recent.length;
    const successes = recent.filter((r) => r.success).length;
    const failures = recent.length - successes;
    await db
      .update(hermesSkillsTable)
      .set({
        successScore: avg,
        successCount: sql`${hermesSkillsTable.successCount} + ${successes > 0 ? 1 : 0}`,
        failureCount: sql`${hermesSkillsTable.failureCount} + ${failures > 0 ? 1 : 0}`,
        updatedAt: new Date(),
      })
      .where(eq(hermesSkillsTable.id, run.skillId));
  } catch (err) {
    logger.error({ err, run }, "hermes: recordSkillRun failed (non-fatal)");
  }
}

/**
 * Promote candidates that have earned it; retire actives that have failed enough.
 * Called by the heartbeat, NOT on the hot path.
 */
export async function pruneAndPromote(): Promise<{ promoted: number; retired: number }> {
  let promoted = 0;
  let retired = 0;
  try {
    // Promote candidates with score >= 0.7 and >= 3 runs.
    const promoteResult = await db
      .update(hermesSkillsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(hermesSkillsTable.status, "candidate"),
          gte(hermesSkillsTable.successScore, PROMOTE_SCORE),
          gte(sql`${hermesSkillsTable.successCount} + ${hermesSkillsTable.failureCount}`, PROMOTE_MIN_RUNS),
        ),
      )
      .returning({ id: hermesSkillsTable.id });
    promoted = promoteResult.length;

    // Retire actives with score < 0.3 and >= 5 runs.
    const retireResult = await db
      .update(hermesSkillsTable)
      .set({ status: "retired", updatedAt: new Date() })
      .where(
        and(
          eq(hermesSkillsTable.status, "active"),
          sql`${hermesSkillsTable.successScore} < ${RETIRE_SCORE}`,
          gte(sql`${hermesSkillsTable.successCount} + ${hermesSkillsTable.failureCount}`, RETIRE_MIN_RUNS),
        ),
      )
      .returning({ id: hermesSkillsTable.id });
    retired = retireResult.length;

    if (promoted || retired) {
      logger.info({ promoted, retired }, "hermes: skill promotion/retirement");
    }
  } catch (err) {
    logger.error({ err }, "hermes: pruneAndPromote failed");
  }
  return { promoted, retired };
}
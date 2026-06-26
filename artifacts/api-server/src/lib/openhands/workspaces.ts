/**
 * OpenHands workspace CRUD.
 *
 * A workspace = (sandbox config) + (repo URL) + (agent backend choice).
 * Persistent in Postgres. Best-effort writes — errors are logged, never thrown.
 */

import { db } from "@workspace/db";
import {
  openhandsWorkspacesTable,
  type OpenhandsWorkspace,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger";
import type { CreateWorkspaceInput } from "./types";

export async function createWorkspace(input: CreateWorkspaceInput): Promise<OpenhandsWorkspace | null> {
  try {
    const [row] = await db
      .insert(openhandsWorkspacesTable)
      .values({
        name: input.name,
        description: input.description ?? null,
        repoUrl: input.repoUrl ?? null,
        baseBranch: input.baseBranch ?? "main",
        sandboxKind: input.sandboxKind ?? "local",
        sandboxConfig: (input.sandboxConfig ?? {}) as object,
        agentBackend: input.agentBackend ?? "openhands",
        status: "ready",
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err, name: input.name }, "openhands: createWorkspace failed");
    return null;
  }
}

export async function listWorkspaces(opts: { status?: string; limit?: number } = {}): Promise<OpenhandsWorkspace[]> {
  try {
    const where = opts.status ? eq(openhandsWorkspacesTable.status, opts.status) : undefined;
    return await db
      .select()
      .from(openhandsWorkspacesTable)
      .where(where as any)
      .orderBy(sql`${openhandsWorkspacesTable.createdAt} DESC`)
      .limit(opts.limit ?? 100);
  } catch (err) {
    logger.error({ err }, "openhands: listWorkspaces failed");
    return [];
  }
}

export async function getWorkspaceById(id: number): Promise<OpenhandsWorkspace | null> {
  try {
    const [row] = await db
      .select()
      .from(openhandsWorkspacesTable)
      .where(eq(openhandsWorkspacesTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err, id }, "openhands: getWorkspaceById failed");
    return null;
  }
}

export async function getWorkspaceByName(name: string): Promise<OpenhandsWorkspace | null> {
  try {
    const [row] = await db
      .select()
      .from(openhandsWorkspacesTable)
      .where(eq(openhandsWorkspacesTable.name, name));
    return row ?? null;
  } catch (err) {
    logger.error({ err, name }, "openhands: getWorkspaceByName failed");
    return null;
  }
}

export async function setWorkspaceStatus(id: number, status: "ready" | "busy" | "archived"): Promise<void> {
  try {
    await db
      .update(openhandsWorkspacesTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(openhandsWorkspacesTable.id, id));
  } catch (err) {
    logger.error({ err, id, status }, "openhands: setWorkspaceStatus failed");
  }
}
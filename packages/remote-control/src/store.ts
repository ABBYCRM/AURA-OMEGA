/**
 * Device registry store — CRUD over bos_devices table.
 */

import { db } from "@workspace/db";
import {
  bosDevicesTable,
  bosCommandsTable,
  bosInstallRunsTable,
  bosScreenshotsTable,
  type BosDevice,
  type InsertBosDevice,
  type BosCommand,
  type BosInstallRun,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

export async function listDevices(enabledOnly = false): Promise<BosDevice[]> {
  const where = enabledOnly ? eq(bosDevicesTable.enabled, true) : undefined;
  return db.select().from(bosDevicesTable).where(where).orderBy(desc(bosDevicesTable.id));
}

export async function getDevice(id: number): Promise<BosDevice | null> {
  const [row] = await db.select().from(bosDevicesTable).where(eq(bosDevicesTable.id, id));
  return row ?? null;
}

export async function getDeviceByHost(host: string): Promise<BosDevice | null> {
  const [row] = await db.select().from(bosDevicesTable).where(eq(bosDevicesTable.host, host));
  return row ?? null;
}

export async function upsertDevice(input: InsertBosDevice): Promise<BosDevice | null> {
  try {
    if (input.id) {
      const [row] = await db
        .update(bosDevicesTable)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(bosDevicesTable.id, input.id))
        .returning();
      return row ?? null;
    }
    const [row] = await db.insert(bosDevicesTable).values(input).returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function deleteDevice(id: number): Promise<boolean> {
  const r = await db.delete(bosDevicesTable).where(eq(bosDevicesTable.id, id)).returning();
  return r.length > 0;
}

export async function setDeviceStatus(
  id: number,
  status: BosDevice["status"],
): Promise<void> {
  await db
    .update(bosDevicesTable)
    .set({ status, lastSeen: new Date(), updatedAt: new Date() })
    .where(eq(bosDevicesTable.id, id));
}

export async function recordCommand(input: {
  deviceId: number;
  adapter: string;
  command: string;
  output?: string | null;
  status: string;
  exitCode?: number | null;
  durationMs?: number | null;
}): Promise<BosCommand | null> {
  try {
    const now = new Date();
    const [row] = await db
      .insert(bosCommandsTable)
      .values({
        deviceId: input.deviceId,
        adapter: input.adapter,
        command: input.command,
        output: input.output ?? null,
        status: input.status,
        exitCode: input.exitCode ?? null,
        startedAt: input.status === "running" ? now : null,
        completedAt: input.status === "success" || input.status === "failed" ? now : null,
        durationMs: input.durationMs ?? null,
      })
      .returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function listCommandsForDevice(deviceId: number, limit = 50): Promise<BosCommand[]> {
  return db
    .select()
    .from(bosCommandsTable)
    .where(eq(bosCommandsTable.deviceId, deviceId))
    .orderBy(desc(bosCommandsTable.createdAt))
    .limit(limit);
}

export async function recordScreenshot(input: {
  deviceId: number;
  adapter: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  storageKey?: string | null;
}): Promise<number | null> {
  try {
    const [row] = await db
      .insert(bosScreenshotsTable)
      .values({
        deviceId: input.deviceId,
        adapter: input.adapter,
        bytes: input.bytes,
        width: input.width ?? null,
        height: input.height ?? null,
        storageKey: input.storageKey ?? null,
      })
      .returning({ id: bosScreenshotsTable.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function recordInstallRun(input: {
  deviceId: number | null;
  adapter: string;
  script: string;
  status: string;
  output?: string | null;
  durationMs?: number | null;
}): Promise<BosInstallRun | null> {
  try {
    const now = new Date();
    const [row] = await db
      .insert(bosInstallRunsTable)
      .values({
        deviceId: input.deviceId,
        adapter: input.adapter,
        script: input.script,
        status: input.status,
        output: input.output ?? null,
        startedAt: now,
        completedAt: input.status === "success" || input.status === "failed" ? now : null,
        durationMs: input.durationMs ?? null,
      })
      .returning();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function installStats(): Promise<{
  devices: number;
  online: number;
  commands: number;
  installs: number;
}> {
  try {
    const [d] = await db.select({ total: sql<number>`COUNT(*)` }).from(bosDevicesTable);
    const [on] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(bosDevicesTable)
      .where(eq(bosDevicesTable.status, "online"));
    const [c] = await db.select({ total: sql<number>`COUNT(*)` }).from(bosCommandsTable);
    const [i] = await db.select({ total: sql<number>`COUNT(*)` }).from(bosInstallRunsTable);
    return {
      devices: Number(d?.total ?? 0),
      online: Number(on?.total ?? 0),
      commands: Number(c?.total ?? 0),
      installs: Number(i?.total ?? 0),
    };
  } catch {
    return { devices: 0, online: 0, commands: 0, installs: 0 };
  }
}
import { pgTable, serial, text, integer, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * BOS-OMEGA — persistent schema.
 *
 * Four tables, all idempotent:
 *   - bos_devices         one row per Windows PC we control
 *   - bos_commands        history of every command dispatched to a device
 *   - bos_screenshots     every screenshot we capture (bytes + storage key)
 *   - bos_install_runs    every install attempt (install tailscale, etc.)
 *
 * Adapter-specific credentials (Tailscale auth key, RustDesk ID/password,
 * MeshCentral group ID, Guacamole connection ID) all live on bos_devices
 * so a single device row carries everything we need to reconnect.
 */

export const bosDevicesTable = pgTable(
  "bos_devices",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    host: text("host").notNull(), // Tailscale MagicDNS hostname or IP
    adapter: text("adapter").notNull(), // tailscale | rustdesk | meshcentral | guacamole | novnc | sunshine | scrcpy
    tailscaleIp: text("tailscale_ip"),
    rustdeskId: text("rustdesk_id"),
    rustdeskPassword: text("rustdesk_password"),
    meshcentralId: text("meshcentral_id"),
    guacamoleConnectionId: text("guacamole_connection_id"),
    status: text("status").notNull().default("unknown"), // unknown | online | offline | installing
    lastSeen: timestamp("last_seen"),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    hostIdx: index("bos_devices_host_idx").on(t.host),
    adapterIdx: index("bos_devices_adapter_idx").on(t.adapter),
    statusIdx: index("bos_devices_status_idx").on(t.status),
  }),
);

export const bosCommandsTable = pgTable(
  "bos_commands",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull(),
    adapter: text("adapter").notNull(),
    command: text("command").notNull(),
    output: text("output"),
    status: text("status").notNull().default("queued"), // queued | running | success | failed
    exitCode: integer("exit_code"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    deviceIdx: index("bos_commands_device_idx").on(t.deviceId),
    statusIdx: index("bos_commands_status_idx").on(t.status),
    createdIdx: index("bos_commands_created_idx").on(t.createdAt),
  }),
);

export const bosScreenshotsTable = pgTable(
  "bos_screenshots",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull(),
    adapter: text("adapter").notNull(),
    bytes: integer("bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key"),
    takenAt: timestamp("taken_at").notNull().defaultNow(),
  },
  (t) => ({
    deviceIdx: index("bos_screenshots_device_idx").on(t.deviceId),
    takenIdx: index("bos_screenshots_taken_idx").on(t.takenAt),
  }),
);

export const bosInstallRunsTable = pgTable(
  "bos_install_runs",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id"),
    adapter: text("adapter").notNull(),
    script: text("script").notNull(),
    status: text("status").notNull().default("queued"),
    output: text("output"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    deviceIdx: index("bos_install_runs_device_idx").on(t.deviceId),
    adapterIdx: index("bos_install_runs_adapter_idx").on(t.adapter),
  }),
);

export const insertBosDeviceSchema = createInsertSchema(bosDevicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSeen: true,
});
export const insertBosCommandSchema = createInsertSchema(bosCommandsTable).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});
export const insertBosScreenshotSchema = createInsertSchema(bosScreenshotsTable).omit({
  id: true,
  takenAt: true,
});
export const insertBosInstallRunSchema = createInsertSchema(bosInstallRunsTable).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export type BosDevice = typeof bosDevicesTable.$inferSelect;
export type InsertBosDevice = z.infer<typeof insertBosDeviceSchema>;
export type BosCommand = typeof bosCommandsTable.$inferSelect;
export type InsertBosCommand = z.infer<typeof insertBosCommandSchema>;
export type BosScreenshot = typeof bosScreenshotsTable.$inferSelect;
export type InsertBosScreenshot = z.infer<typeof insertBosScreenshotSchema>;
export type BosInstallRun = typeof bosInstallRunsTable.$inferSelect;
export type InsertBosInstallRun = z.infer<typeof insertBosInstallRunSchema>;
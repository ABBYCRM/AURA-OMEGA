import { describe, it, expect, beforeEach } from "vitest";
import {
  setCronEnginePool,
  listCronJobs,
  ensureCronJob,
  scheduleToSeconds,
} from "./cron-engine";

/** Mock DB pool that stores cron_jobs rows in a Map. */
function makeMockPool() {
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  return {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.trim();
      if (text.startsWith("INSERT INTO mission_cron_jobs")) {
        const name = String(params[0]);
        const row: Record<string, unknown> = {
          id: nextId++,
          name,
          task_id: params[1],
          goal: params[2],
          interval_seconds: params[3],
          enabled: params[4],
          trigger_type: params[5],
          schedule_text: params[6],
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
        };
        rows.set(name, row);
        return { rows: [row], rowCount: 1 };
      }
      if (text.startsWith("SELECT * FROM mission_cron_jobs")) {
        return { rows: Array.from(rows.values()).sort((a, b) => Number(a.id) - Number(b.id)), rowCount: rows.size };
      }
      if (text.startsWith("UPDATE mission_cron_jobs")) {
        // Find the row by id (last param typically)
        const id = params[params.length - 1];
        let updated: Record<string, unknown> | undefined;
        for (const row of rows.values()) {
          if (row.id === id) {
            row.updated_at = new Date();
            if (text.includes("last_run_at = now()")) {
              row.last_run_at = new Date();
              if (text.includes("last_mission_id = $1")) {
                row.last_mission_id = params[0];
              }
              if (text.includes("last_status = 'running'")) {
                row.last_status = "running";
              }
            }
            if (text.includes("successful_runs = successful_runs + $3")) {
              row.last_status = params[0];
              row.successful_runs = Number(row.successful_runs) + Number(params[2]);
            }
            updated = row;
            break;
          }
        }
        return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    rows,
  };
}

describe("cron engine (operator doctrine 2026-06-27)", () => {
  beforeEach(() => {
    const pool = makeMockPool();
    setCronEnginePool(pool);
  });

  it("scheduleToSeconds parses cron strings and convenience helpers", () => {
    expect(scheduleToSeconds("*/30 * * * *", 3600)).toBe(30 * 60);
    expect(scheduleToSeconds("*/5 * * * *", 3600)).toBe(5 * 60);
    expect(scheduleToSeconds("everyHours(6)", 3600)).toBe(6 * 3600);
    expect(scheduleToSeconds("everyHours(1)", 3600)).toBe(3600);
    expect(scheduleToSeconds("dailyAt(8)", 3600)).toBe(86400);
    expect(scheduleToSeconds(undefined, 3600)).toBe(3600);
    expect(scheduleToSeconds("garbage", 1800)).toBe(1800);
  });

  it("ensureCronJob is idempotent — calling twice yields one row", async () => {
    const r1 = await ensureCronJob({
      name: "n8n-007",
      taskId: "n8n-007",
      goal: "Check Render service health",
      intervalSeconds: 3600,
      enabled: true,
      triggerType: "cron",
      scheduleText: "everyHours(1)",
    });
    expect(r1).not.toBeNull();
    const r2 = await ensureCronJob({
      name: "n8n-007",
      taskId: "n8n-007",
      goal: "Check Render service health (updated)",
      intervalSeconds: 3600,
      enabled: true,
      triggerType: "cron",
    });
    expect(r2).not.toBeNull();
    const all = await listCronJobs();
    expect(all.length).toBe(1);
    expect(all[0].goal).toBe("Check Render service health (updated)");
  });

  it("listCronJobs returns all rows in id order", async () => {
    await ensureCronJob({ name: "n8n-007", goal: "a", intervalSeconds: 3600 });
    await ensureCronJob({ name: "n8n-008", goal: "b", intervalSeconds: 7200 });
    await ensureCronJob({ name: "n8n-054", goal: "c", intervalSeconds: 1800 });
    const jobs = await listCronJobs();
    expect(jobs.length).toBe(3);
    expect(jobs[0].name).toBe("n8n-007");
    expect(jobs[1].name).toBe("n8n-008");
    expect(jobs[2].name).toBe("n8n-054");
  });

  it("ensureCronJob handles missing DB pool gracefully", async () => {
    setCronEnginePool(null);
    const r = await ensureCronJob({ name: "test", goal: "test", intervalSeconds: 60 });
    expect(r).toBeNull();
  });
});

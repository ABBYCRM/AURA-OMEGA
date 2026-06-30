import { Router } from "express";
import { db } from "@workspace/db";
import { agentMemoryTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const SCRATCH_KEY = "operator_scratchpad";
const SCRATCH_AGENT_ID = 1; // attributed to ABBY (system-level)

export async function getScratchpad(): Promise<string> {
  try {
    const rows = await db
      .select()
      .from(agentMemoryTable)
      .where(and(eq(agentMemoryTable.key, SCRATCH_KEY), eq(agentMemoryTable.agentId, SCRATCH_AGENT_ID)))
      .limit(1);
    return rows[0]?.content ?? "";
  } catch {
    return "";
  }
}

// GET /api/scratchpad
router.get("/scratchpad", async (_req, res) => {
  const content = await getScratchpad();
  res.json({ content });
});

// PUT /api/scratchpad — replaces the entire scratchpad
router.put("/scratchpad", async (req, res) => {
  const content = String(req.body?.content ?? "").slice(0, 20_000);
  try {
    // Delete existing entry then insert fresh — clean upsert without needing a unique constraint
    await db
      .delete(agentMemoryTable)
      .where(and(eq(agentMemoryTable.key, SCRATCH_KEY), eq(agentMemoryTable.agentId, SCRATCH_AGENT_ID)));
    if (content.trim()) {
      await db.insert(agentMemoryTable).values({
        agentId: SCRATCH_AGENT_ID,
        agentName: "system",
        key: SCRATCH_KEY,
        content,
        tags: "scratchpad,operator",
        embedding: null,
      });
    }
    res.json({ saved: true, length: content.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

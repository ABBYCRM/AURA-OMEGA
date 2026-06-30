import { Router } from "express";
import { scratchRead } from "../lib/agentScratch";

const router = Router();

// GET /api/agent-scratch?channelId=X
router.get("/agent-scratch", (req, res) => {
  const channelId = Number(req.query["channelId"] ?? 0);
  if (!channelId) {
    res.status(400).json({ error: "channelId is required" });
    return;
  }
  res.json({ entries: scratchRead(channelId) });
});

export default router;

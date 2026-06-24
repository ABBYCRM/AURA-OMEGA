import { Router } from "express";
import {
  getDiscordBridgeStatus,
  postToDiscord,
  saveDiscordReplyToChannel,
  syncRecentDiscordMessages,
  testDiscordBridge,
  waitForAuraReply,
} from "../lib/discordBridge";

const router = Router();

router.get("/status", async (_req, res) => {
  res.json(getDiscordBridgeStatus());
});

router.get("/test", async (req, res) => {
  try {
    res.json(await testDiscordBridge());
  } catch (err) {
    req.log.error({ err }, "Discord bridge test failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/send", async (req, res): Promise<void> => {
  const { message } = req.body as { message?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  try {
    const sent = await postToDiscord(message.trim());
    res.status(202).json({ ok: true, discordMessageId: sent.id });
    return;
  } catch (err) {
    req.log.error({ err }, "Discord send failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
});

router.post("/sync", async (req, res): Promise<void> => {
  const channelId = Number((req.body as { channelId?: number }).channelId);
  if (!Number.isFinite(channelId) || channelId <= 0) {
    res.status(400).json({ error: "valid channelId is required" });
    return;
  }
  try {
    const saved = await syncRecentDiscordMessages(channelId);
    res.json({ ok: true, saved: saved.length });
    return;
  } catch (err) {
    req.log.error({ err }, "Discord sync failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
});

// SSE endpoint used by the UI. The message is posted into Discord first; the
// existing AURA-OMEGA instance sees it there and replies there; this route
// polls Discord for that reply, stores it locally, and streams it back to UI.
router.post("/chat", async (req, res): Promise<void> => {
  const { message, channelId } = req.body as { message?: string; channelId?: number };
  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (!Number.isFinite(Number(channelId)) || Number(channelId) <= 0) {
    res.status(400).json({ error: "valid channelId is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const sendEvent = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    sendEvent({ token: "", status: "sent_to_discord" });
    const sent = await postToDiscord(message.trim());
    sendEvent({ token: "", status: "waiting_for_aura", discordMessageId: sent.id });

    const reply = await waitForAuraReply(sent);
    if (!reply) {
      sendEvent({
        error: "Discord bridge timed out waiting for the AURA reply. Confirm the AURA-OMEGA runtime is watching this Discord channel and set DISCORD_AURA_BOT_USER_IDS if needed.",
      });
      res.end();
      return;
    }

    await saveDiscordReplyToChannel(Number(channelId), reply);
    // Stream in chunks so the UI keeps the same token-style feel.
    const chunks = reply.content.match(/[\s\S]{1,80}/g) ?? [reply.content];
    for (const chunk of chunks) sendEvent({ token: chunk });
    sendEvent({ done: true, agentName: reply.author.global_name || reply.author.username || "Discord AURA", agentId: null, model: "discord-bridge" });
    res.end();
    return;
  } catch (err) {
    req.log.error({ err }, "Discord bridge chat failed");
    sendEvent({ error: err instanceof Error ? err.message : String(err) });
    res.end();
    return;
  }
});

export default router;

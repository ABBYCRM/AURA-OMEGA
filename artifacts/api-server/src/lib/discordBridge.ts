import { db } from "@workspace/db";
import { channelsTable, messagesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export interface DiscordBridgeConfig {
  enabled: boolean;
  tokenConfigured: boolean;
  channelConfigured: boolean;
  channelId: string | null;
  guildId: string | null;
  mode: "discord-middle";
}

interface DiscordAuthor {
  id: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: DiscordAuthor;
}

const DISCORD_API = "https://discord.com/api/v10";

function cfg() {
  const token = process.env["DISCORD_BOT_TOKEN"]?.trim() || "";
  const channelId = process.env["DISCORD_CHANNEL_ID"]?.trim() || "";
  const enabled = (process.env["DISCORD_BRIDGE_ENABLED"] ?? "true") !== "false";
  const auraUserIds = (process.env["DISCORD_AURA_BOT_USER_IDS"] ?? process.env["DISCORD_AURA_USER_IDS"] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    token,
    channelId,
    guildId: process.env["DISCORD_GUILD_ID"]?.trim() || null,
    enabled,
    auraUserIds,
    waitMs: Number(process.env["DISCORD_REPLY_WAIT_MS"] ?? 90_000),
    pollMs: Number(process.env["DISCORD_REPLY_POLL_MS"] ?? 2_000),
  };
}

function headers(token: string) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "AURA-OMEGA/1.0",
  };
}

function requireReady() {
  const c = cfg();
  if (!c.enabled) throw new Error("Discord bridge is disabled. Set DISCORD_BRIDGE_ENABLED=true.");
  if (!c.token) throw new Error("DISCORD_BOT_TOKEN is missing.");
  if (!c.channelId) throw new Error("DISCORD_CHANNEL_ID is missing.");
  return c;
}

export function getDiscordBridgeStatus(): DiscordBridgeConfig {
  const c = cfg();
  return {
    enabled: c.enabled,
    tokenConfigured: Boolean(c.token),
    channelConfigured: Boolean(c.channelId),
    channelId: c.channelId || null,
    guildId: c.guildId,
    mode: "discord-middle",
  };
}

async function discordFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = requireReady();
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: { ...headers(c.token), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export async function testDiscordBridge() {
  const c = requireReady();
  const channel = await discordFetch<{ id: string; name?: string; type?: number }>(`/channels/${c.channelId}`);
  return { ok: true, channel, ...getDiscordBridgeStatus() };
}

export async function postToDiscord(content: string) {
  const c = requireReady();
  return discordFetch<DiscordMessage>(`/channels/${c.channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: content.slice(0, 1900),
      allowed_mentions: { parse: [] },
    }),
  });
}

async function listDiscordMessages(afterDiscordMessageId?: string) {
  const c = requireReady();
  const qs = new URLSearchParams({ limit: "20" });
  if (afterDiscordMessageId) qs.set("after", afterDiscordMessageId);
  return discordFetch<DiscordMessage[]>(`/channels/${c.channelId}/messages?${qs.toString()}`);
}

function isCandidateAuraReply(m: DiscordMessage, sent: DiscordMessage): boolean {
  const c = cfg();
  if (!m.content?.trim()) return false;
  if (m.id === sent.id) return false;
  if (m.author?.id === sent.author?.id) return false;
  if (c.auraUserIds.length > 0) return c.auraUserIds.includes(m.author.id);
  return true;
}

export async function waitForAuraReply(sent: DiscordMessage): Promise<DiscordMessage | null> {
  const c = cfg();
  const start = Date.now();
  while (Date.now() - start < c.waitMs) {
    const messages = await listDiscordMessages(sent.id);
    const chronological = messages.slice().reverse();
    const reply = chronological.find((m) => isCandidateAuraReply(m, sent));
    if (reply) return reply;
    await new Promise((resolve) => setTimeout(resolve, Math.max(500, c.pollMs)));
  }
  return null;
}


function metadataNeedle(discordMessageId: string): string {
  return `%"discordMessageId":"${discordMessageId.replace(/[%_\\]/g, "")}"%`;
}

async function alreadySavedDiscordMessage(channelId: number, discordMessageId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.channelId, channelId),
      sql`${messagesTable.metadata} like ${metadataNeedle(discordMessageId)}`,
    ))
    .limit(1);
  return rows.length > 0;
}

export async function saveDiscordReplyToChannel(channelId: number, reply: DiscordMessage) {
  if (await alreadySavedDiscordMessage(channelId, reply.id)) return null;
  const name = reply.author.global_name || reply.author.username || "Discord AURA";
  const metadata = JSON.stringify({
    source: "discord",
    discordMessageId: reply.id,
    discordAuthorId: reply.author.id,
    discordTimestamp: reply.timestamp,
  });
  const [message] = await db.insert(messagesTable).values({
    channelId,
    agentName: name,
    agentColor: "#8b5cf6",
    content: reply.content,
    messageType: "assistant",
    metadata,
  }).returning();
  await db.update(channelsTable).set({ lastActivity: new Date() }).where(eq(channelsTable.id, channelId));
  return message;
}

export async function syncRecentDiscordMessages(channelId: number) {
  const messages = await listDiscordMessages();
  const saved = [];
  for (const m of messages.slice().reverse()) {
    if (!m.content?.trim()) continue;
    if (await alreadySavedDiscordMessage(channelId, m.id)) continue;
    const name = m.author.global_name || m.author.username || "Discord";
    const [savedMessage] = await db.insert(messagesTable).values({
      channelId,
      agentName: name,
      agentColor: m.author.bot ? "#8b5cf6" : "#22c55e",
      content: m.content,
      messageType: m.author.bot ? "assistant" : "system",
      metadata: JSON.stringify({ source: "discord-sync", discordMessageId: m.id, discordAuthorId: m.author.id }),
    }).returning();
    saved.push(savedMessage);
  }
  await db.update(channelsTable).set({ lastActivity: new Date() }).where(eq(channelsTable.id, channelId));
  return saved;
}

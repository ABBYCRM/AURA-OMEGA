/** sessionStorage key for handing a starter goal from the Swarm page → Chat. */
export const GOAL_DRAFT_KEY = "aura-omega-ui:goal-draft";

/** sessionStorage key for handing a composer mode + agent from Agents hub → Chat. */
export const CHAT_SETUP_KEY = "aura-omega-ui:chat-setup";

export type ComposerMode = "chat" | "code" | "image" | "video" | "vision";

export interface ChatSetup {
  mode?: ComposerMode;
  agentId?: number | null;
}

export function setChatSetup(setup: ChatSetup): void {
  try { sessionStorage.setItem(CHAT_SETUP_KEY, JSON.stringify(setup)); } catch { /* ignore */ }
}

export function takeChatSetup(): ChatSetup | null {
  try {
    const raw = sessionStorage.getItem(CHAT_SETUP_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CHAT_SETUP_KEY);
    return JSON.parse(raw) as ChatSetup;
  } catch {
    return null;
  }
}

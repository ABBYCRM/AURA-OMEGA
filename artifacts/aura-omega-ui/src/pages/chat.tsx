import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useListChannels,
  useCreateChannel,
  useListMessages,
  useSendMessage,
  getListChannelsQueryKey,
  getListMessagesQueryKey,
  resolveApiUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAiStream } from "@/hooks/useAiStream";
import { GOAL_DRAFT_KEY, takeChatSetup, type ComposerMode } from "@/lib/handoff";
import { openAppDrawer } from "@/components/layout/AppLayout";
import { MessageContent } from "@/components/chat/MessageContent";
import { WhatsNewButton } from "@/components/WhatsNew";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Paperclip, X, Check, Menu, ArrowRight, Asterisk,
  Bot, AlertTriangle, Loader2, Sparkles, Copy, Volume2, Square, Mic, Rocket,
  ChevronDown, ChevronUp, Brain,
} from "lucide-react";

// ── Composer modes (Claw-style pills) ────────────────────────────────────────
// The persisted user message stays clean; the mode adds an explicit operator
// directive to what the model receives, steering routing/tool choice.
const MODES: Array<{ id: ComposerMode; label: string }> = [
  { id: "chat",   label: "Chat" },
  { id: "code",   label: "Code" },
  { id: "image",  label: "Image" },
  { id: "video",  label: "Video" },
  { id: "vision", label: "Vision" },
];

const MODE_DIRECTIVE: Record<ComposerMode, string> = {
  chat: "",
  code: "\n\n(Operator mode: CODE — treat this as a hands-on coding task: write or edit real code with your tools, run it, verify it works, and report evidence.)",
  image: "\n\n(Operator mode: IMAGE — generate the requested image with your image tools and return it inline in this channel.)",
  video: "\n\n(Operator mode: VIDEO — produce the requested video asset with your tools; if video generation isn't available, say so plainly and deliver the closest real alternative, e.g. a storyboard with generated stills.)",
  vision: "\n\n(Operator mode: VISION — analyze the attached image(s) in detail and answer based on what you actually see.)",
};

const MODE_PLACEHOLDER: Record<ComposerMode, string> = {
  chat: "Message AURA-OMEGA…",
  code: "Describe the coding task…",
  image: "Describe the image to generate…",
  video: "Describe the video to produce…",
  vision: "Attach an image and ask about it…",
};

interface AgentOption { id: number; name: string; }

// Uploaded to /api/uploads on pick; images are rendered inline and sent to ABBY
// as vision input, text files have their text read by the agent.
interface Attachment { id: number; name: string; size: number; kind: string; mime: string; url: string; }

// Minimal typing for the browser Web Speech API (not in lib.dom for all targets).
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: SpeechRecognitionEventLike) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

// Read a File as a base64 data URL for upload.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const qc = useQueryClient();
  const { data: channelsData, isLoading: channelsLoading } = useListChannels({
    query: { refetchInterval: 8000, queryKey: getListChannelsQueryKey() },
  });
  const channels = Array.isArray(channelsData) ? channelsData : [];

  // Derive active channel from ?c= URL param; fall back to first channel
  const searchStr = useSearch();
  const urlChannelId = useMemo(() => {
    const n = parseInt(new URLSearchParams(searchStr.replace(/^\?/, "")).get("c") ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchStr]);
  const activeId = useMemo(() => {
    if (!channels.length) return null;
    if (urlChannelId != null && channels.some((c) => c.id === urlChannelId)) return urlChannelId;
    return channels[0]?.id ?? null;
  }, [channels, urlChannelId]);
  const [exportOpen, setExportOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<{ enabled: boolean; tokenConfigured: boolean; channelConfigured: boolean; channelId: string | null } | null>(null);
  // True while the scratchpad has seen activity in the last ~15s — signals a
  // background swarm mission is still running even after the SSE call ends.
  const [swarmActive, setSwarmActive] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(resolveApiUrl("/api/discord/status"));
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setBridgeStatus(data);
      } catch { /* status is cosmetic; chat endpoint still reports hard errors */ }
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);


  // Goal handed off from the Swarm page: prefill the composer so the user lands
  // in Chat (the command surface) ready to dispatch. We never auto-send.
  const [pendingDraft, setPendingDraft] = useState(false);

  const activeChannel = channels.find((c) => c.id === activeId) ?? null;

  const { data: messagesData, isLoading: msgsLoading, isError: msgsError, refetch: refetchMsgs } =
    useListMessages(activeId ?? 0, {
      query: { enabled: activeId != null, refetchInterval: 4000, queryKey: getListMessagesQueryKey(activeId ?? 0) },
    });

  const messages = Array.isArray(messagesData) ? messagesData : [];

  const ai = useAiStream(() => {
    if (activeId) setTimeout(() => qc.invalidateQueries({ queryKey: getListMessagesQueryKey(activeId) }), 400);
  });

  const sendMessage = useSendMessage();
  const createChannel = useCreateChannel({
    mutation: {
      onSuccess: (ch) => {
        qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        navigate(`/chat?c=${(ch as { id: number }).id}`);
      },
      onError: () => toast.error("Couldn't start a new chat."),
    },
  });

  // ── Composer ──────────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<ComposerMode>("chat");
  // null = Auto (ABBY routes to the right agent). Otherwise a fixed agent id.
  const [agentSel, setAgentSel] = useState<number | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);

  // Real swarm roster for the engine selector. Agent ids are fixed
  // (ABBY=1, AURA-1..5 = 2-6), so if the API is down the selector still
  // offers the known swarm instead of only Auto.
  useEffect(() => {
    let alive = true;
    const fallback: AgentOption[] = [
      { id: 1, name: "ABBY" }, { id: 2, name: "AURA-1" }, { id: 3, name: "AURA-2" },
      { id: 4, name: "AURA-3" }, { id: 5, name: "AURA-4" }, { id: 6, name: "AURA-5" },
    ];
    fetch(resolveApiUrl("/api/agents"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list) => {
        if (!alive) return;
        const rows = Array.isArray(list) && list.length > 0
          ? list.map((a: { id: number; name: string }) => ({ id: a.id, name: a.name }))
          : fallback;
        setAgents(rows);
      })
      .catch(() => { if (alive) setAgents(fallback); });
    return () => { alive = false; };
  }, []);

  // Mode/agent handed off from the All Agents hub.
  useEffect(() => {
    const setup = takeChatSetup();
    if (setup?.mode) setMode(setup.mode);
    if (setup?.agentId !== undefined) setAgentSel(setup.agentId);
  }, []);

  const engineName = agentSel == null
    ? "Auto — ABBY routes"
    : agents.find((a) => a.id === agentSel)?.name ?? `Agent ${agentSel}`;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Voice input (speech-to-text) via the browser Web Speech API. Dictated text is
  // appended to the composer; no audio leaves the browser for this path.
  const toggleVoice = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Rec) {
      toast.error("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    if (listening) {
      (recognitionRef.current as SpeechRecognitionLike | null)?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText((prev) => {
        const base = prev.replace(/\s*\[…\]$/, "");
        return (finalText ? `${base}${base && !base.endsWith(" ") ? " " : ""}${finalText}` : `${base} […]`).trimStart();
      });
    };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => {
      setListening(false);
      setText((prev) => prev.replace(/\s*\[…\]$/, ""));
      requestAnimationFrame(() => taRef.current?.focus());
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };
  useEffect(autoGrow, [text]);

  // Pick up a goal handed off from the Swarm page (set the composer text once,
  // then clear the handoff). If there's no conversation yet, start one so the
  // prefilled goal is immediately sendable.
  useEffect(() => {
    let draft: string | null = null;
    try { draft = sessionStorage.getItem(GOAL_DRAFT_KEY); } catch { /* ignore */ }
    if (draft) {
      setText(draft);
      setPendingDraft(true);
      try { sessionStorage.removeItem(GOAL_DRAFT_KEY); } catch { /* ignore */ }
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (pendingDraft && activeId == null && !channelsLoading && channels.length === 0) {
      newChat();
      setPendingDraft(false);
    }
  }, [pendingDraft, activeId, channelsLoading, channels.length]);

  // Auto-scroll to newest content (and while streaming).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, ai.tokens, ai.streaming]);

  // Don't carry a stale "swarm is working" indicator across a channel switch.
  useEffect(() => { setSwarmActive(false); }, [activeId]);

  const [, navigate] = useLocation();

  // Launch the current composer text as a Mission Kernel goal. Posts to
  // /api/missions, surfaces a deep-link to /missions, and clears the composer
  // so the operator can keep iterating. This is the surface that was missing
  // before — pasting a goal into the chat used to vanish into a chat reply
  // instead of becoming a tracked, durable mission.
  const launchAsMission = async () => {
    const goal = text.trim();
    if (!goal) return;
    try {
      const r = await fetch(resolveApiUrl("/api/missions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, createdBy: "chat" }),
      });
      if (!r.ok) {
        const err = await r.text();
        toast.error(`Mission creation failed: ${err.slice(0, 120)}`);
        return;
      }
      const d = await r.json();
      const missionId = d?.mission?.id;
      const gate = d?.brainGate ?? "?";
      const steps = Array.isArray(d?.plan) ? d.plan.length : 0;
      toast.success(
        `Mission #${missionId} created (${steps} steps, gate=${gate})`,
        {
          description: "Tap to open the mission dashboard",
          action: {
            label: "Open",
            onClick: () => navigate(`/missions`),
          },
        },
      );
      setText("");
    } catch (e) {
      toast.error(`Mission creation failed: ${String(e).slice(0, 120)}`);
    }
  };

  const send = () => {
    const body = text.trim();
    if ((!body && !attachment) || activeId == null || ai.streaming) return;
    const att = attachment;
    // What gets persisted/shown in the feed: images render inline via markdown,
    // other files show as a labelled link.
    let composed = body;
    if (att) {
      const tag =
        att.kind === "image"
          ? `![${att.name}](${resolveApiUrl(att.url)})`
          : `📎 [${att.name}](${resolveApiUrl(att.url)})`;
      composed = `${body}${body ? "\n\n" : ""}${tag}`;
    }
    setText("");
    setAttachment(null);
    requestAnimationFrame(autoGrow);
    sendMessage.mutate(
      { data: { content: composed, messageType: "user" }, channelId: activeId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListMessagesQueryKey(activeId) });
          // The model gets the original text plus the mode directive and the
          // attachment id (vision/text). The persisted message stays clean.
          ai.send({
            message: (body || "(see attached file)") + MODE_DIRECTIVE[mode],
            agentId: agentSel,
            channelId: activeId,
            attachmentIds: att ? [att.id] : undefined,
          });
        },
        onError: () => toast.error("Couldn't send your message. Try again."),
      },
    );
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const maxUploadMb = Number(import.meta.env.VITE_AURA_MAX_UPLOAD_MB ?? 100);
    if (f.size > maxUploadMb * 1024 * 1024) {
      toast.error(`File too large (max ${maxUploadMb} MB).`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(f);
      const res = await fetch(resolveApiUrl("/api/uploads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, mime: f.type || "application/octet-stream", dataBase64: dataUrl }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || `HTTP ${res.status}`);
      }
      const a = (await res.json()) as Attachment;
      setAttachment(a);
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  // ── Conversation actions ────────────────────────────────────────────────
  const newChat = () =>
    createChannel.mutate({ data: { name: `New mission`, type: "general" } });


  const exportConvo = (fmt: "txt" | "json") => {
    setExportOpen(false);
    if (!messages.length) { toast("Nothing to export yet."); return; }
    const rows = messages.map((m) => ({
      role: m.messageType === "user" ? "user" : (m.agentName || "assistant"),
      content: m.content,
      at: m.timestamp,
    }));
    const blob =
      fmt === "json"
        ? new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })
        : new Blob([rows.map((r) => `### ${r.role} · ${new Date(r.at).toLocaleString()}\n${r.content}\n`).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeChannel?.name || "conversation").replace(/\s+/g, "-").toLowerCase()}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyThread = () => {
    if (!messages.length) { toast("Nothing to copy yet."); return; }
    const rows = messages
      .filter((m) => (m.content ?? "").trim())
      .map((m) => {
        const role = m.messageType === "user" ? "USER" : (m.agentName || "ASSISTANT").toUpperCase();
        return `${role} [${new Date(m.timestamp).toLocaleString()}]\n${m.content}`;
      });
    navigator.clipboard?.writeText(rows.join("\n\n---\n\n")).then(() => {
      toast.success("Thread copied to clipboard.");
    }).catch(() => toast.error("Clipboard access denied."));
  };

  const visibleMessages = messages.filter((m) => (m.content ?? "").trim().length > 0);

  return (
    <div className="flex w-full h-full bg-background text-foreground overflow-hidden">
      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — Claw style: hamburger · engine selector · copy */}
        <header className="h-16 shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4">
          <button
            onClick={openAppDrawer}
            aria-label="Open menu"
            className="lg:hidden w-11 h-11 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Engine (agent) selector pill */}
          <div className="relative min-w-0">
            <button
              onClick={() => setAgentMenuOpen((v) => !v)}
              aria-label="Select engine"
              className="flex items-center gap-2 rounded-xl bg-card border border-card-border px-4 min-h-[44px] text-sm font-bold max-w-[60vw] sm:max-w-xs"
            >
              <span className="truncate">{engineName}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
            {agentMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAgentMenuOpen(false)} />
                <div className="absolute left-0 mt-1 w-64 rounded-xl border border-card-border bg-popover shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => { setAgentSel(null); setAgentMenuOpen(false); }}
                    className={cn("w-full text-left px-3 py-2.5 text-sm hover:bg-muted", agentSel == null && "font-bold text-primary")}
                  >
                    Auto — ABBY routes
                    <span className="block text-[11px] text-muted-foreground font-normal">Best agent picked per message</span>
                  </button>
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAgentSel(a.id); setAgentMenuOpen(false); }}
                      className={cn("w-full text-left px-3 py-2.5 text-sm hover:bg-muted", agentSel === a.id && "font-bold text-primary")}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 hidden sm:block">
            <h1 className="text-sm font-semibold truncate text-muted-foreground">{activeChannel?.name ?? ""}</h1>
          </div>
          <div className="flex-1 sm:hidden" />

          <BridgePill status={bridgeStatus} />
          <WhatsNewButton />
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              aria-label="Copy or export conversation"
              className="w-11 h-11 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground"
            >
              <Copy className="w-4 h-4" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-1 w-44 rounded-xl border border-card-border bg-popover shadow-xl z-20 overflow-hidden">
                  <button onClick={() => { copyThread(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">Copy thread</button>
                  <button onClick={() => exportConvo("txt")} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">Download .txt</button>
                  <button onClick={() => exportConvo("json")} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">Download .json</button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {activeId == null && !channelsLoading ? (
              <EmptyState onNew={newChat} />
            ) : msgsLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading conversation…
              </div>
            ) : msgsError ? (
              <div className="flex flex-col items-center py-20 gap-3 text-center">
                <AlertTriangle className="w-7 h-7 text-destructive" />
                <span className="text-sm text-muted-foreground">Couldn't load this conversation.</span>
                <button onClick={() => refetchMsgs()} className="px-4 py-1.5 rounded-lg border border-card-border text-sm hover:border-primary/40">Retry</button>
              </div>
            ) : visibleMessages.length === 0 && !ai.streaming ? (
              <EmptyConversation onPrompt={(p) => { setText(p); taRef.current?.focus(); }} />
            ) : (
              visibleMessages.map((m) => <MessageRow key={m.id} message={m} />)
            )}

            {/* Live streaming reply */}
            {ai.streaming && (
              <div className="flex gap-3">
                <Avatar name={ai.agentName ?? "ABBY"} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold mb-1 mt-1.5">{ai.agentName ?? "ABBY"}</div>
                  {ai.tokens ? (
                    <div className="chat-bubble-agent px-4 py-3 text-sm leading-relaxed">
                      <MessageContent content={ai.tokens} />
                    </div>
                  ) : (
                    <div className="chat-bubble-agent px-4 py-3">
                      <ThinkingIndicator label="Thinking" />
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* The initial /api/ai/chat request can finish while the swarm keeps
                working server-side (multi-phase missions post messages async).
                Without this, the UI goes idle-looking even though agents are
                still running — surface that via the scratchpad's own recency signal. */}
            {!ai.streaming && swarmActive && (
              <div className="flex gap-3">
                <Avatar name="ABBY" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold mb-1 mt-1.5">ABBY</div>
                  <div className="chat-bubble-agent px-4 py-3">
                    <ThinkingIndicator label="Swarm is still working" />
                  </div>
                </div>
              </div>
            )}
            {ai.error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                {ai.error.includes("402") || /credit/i.test(ai.error)
                  ? "The model provider is out of credits. Add credits or configure a fallback model."
                  : `Something went wrong: ${ai.error.slice(0, 160)}`}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Agent working scratchpad */}
        {activeId != null && <AgentScratchPanel channelId={activeId} streaming={ai.streaming} onActivity={setSwarmActive} />}

        {/* Composer */}
        <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            {uploading && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-2.5 py-1.5 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uploading…
              </div>
            )}
            {attachment && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-2.5 py-1.5 text-sm">
                {attachment.kind === "image" ? (
                  <img src={resolveApiUrl(attachment.url)} alt={attachment.name} className="w-8 h-8 rounded object-cover border border-card-border" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="truncate max-w-[200px]">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="rounded-3xl border border-primary/25 bg-card shadow-sm px-3 pt-3 pb-2.5 focus-within:border-primary/50 transition-all">
              {/* Mode pills */}
              <div className="flex items-center gap-2 pb-2 overflow-x-auto">
                {MODES.map((m) => {
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMode(m.id);
                        // Vision is about an image — open the picker if none attached yet.
                        if (m.id === "vision" && !attachment && !uploading) fileRef.current?.click();
                      }}
                      className={cn(
                        "rounded-full px-4 min-h-[40px] text-sm font-bold transition-colors border shrink-0",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-card-border hover:text-foreground",
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                disabled={activeId == null}
                aria-label="Message"
                placeholder={ai.streaming ? "Waiting for AURA-OMEGA response…" : MODE_PLACEHOLDER[mode]}
                className="w-full resize-none bg-transparent py-2 text-[15px] leading-relaxed focus:outline-none placeholder:text-muted-foreground/60 max-h-[200px]"
              />

              {/* Bottom row: attach · mic · engine line · mission · send */}
              <div className="flex items-center gap-2 pt-1.5">
                <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} aria-hidden="true" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={activeId == null || uploading}
                  aria-label="Attach a file"
                  className="w-10 h-10 rounded-xl bg-muted border border-card-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors shrink-0"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleVoice}
                  disabled={activeId == null}
                  aria-label={listening ? "Stop voice input" : "Speak your message"}
                  title={listening ? "Listening… click to stop" : "Speak your message"}
                  className={cn(
                    "w-10 h-10 rounded-xl bg-muted border border-card-border flex items-center justify-center transition-colors disabled:opacity-40 shrink-0",
                    listening ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Mic className={cn("w-4 h-4", listening && "animate-pulse")} />
                </button>
                <span className="text-sm text-muted-foreground truncate min-w-0">
                  Engine: {engineName}
                </span>
                <div className="flex-1" />
                <button
                  onClick={launchAsMission}
                  disabled={!text.trim() || activeId == null || ai.streaming || uploading}
                  aria-label="Launch as mission"
                  title="Send this goal to the Mission Kernel (event-driven execution loop). Tracks progress, retries, and final state on /missions."
                  className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center justify-center hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Rocket className="w-4 h-4" />
                </button>
                <button
                  onClick={send}
                  disabled={(!text.trim() && !attachment) || activeId == null || ai.streaming || uploading}
                  aria-label="Send message"
                  className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  {ai.streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60 text-center mt-2 select-none">
              AURA-OMEGA can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

type ScratchType = "thought" | "hypothesis" | "result" | "todo" | "note";
interface ScratchEntry { agentName: string; type: ScratchType; content: string; ts: number; }

const SCRATCH_TYPE_STYLE: Record<ScratchType, { label: string; color: string }> = {
  thought:    { label: "thought",    color: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10" },
  hypothesis: { label: "hypothesis", color: "text-violet-400 border-violet-400/30 bg-violet-400/10" },
  result:     { label: "result",     color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  todo:       { label: "todo",       color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  note:       { label: "note",       color: "text-muted-foreground border-border bg-muted/30" },
};

function AgentScratchPanel({ channelId, streaming, onActivity }: { channelId: number; streaming: boolean; onActivity?: (active: boolean) => void }) {
  const [entries, setEntries] = useState<ScratchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [hasHadContent, setHasHadContent] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(resolveApiUrl(`/api/agent-scratch?channelId=${channelId}`));
        if (!r.ok) return;
        const data = await r.json();
        const list: ScratchEntry[] = Array.isArray(data.entries) ? data.entries : [];
        if (!alive) return;
        setEntries(list);
        if (list.length > 0) {
          setHasHadContent(true);
          setOpen(true);
        }
        // A scratch entry younger than ~15s means a background mission is
        // still actively producing work, even if the SSE call already ended.
        const lastTs = list.length > 0 ? list[list.length - 1].ts : 0;
        onActivity?.(Boolean(lastTs) && Date.now() - lastTs < 15000);
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, streaming ? 1500 : 5000);
    return () => { alive = false; clearInterval(interval); onActivity?.(false); };
  }, [channelId, streaming]);

  if (!hasHadContent && entries.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-card-border bg-card/40">
      <div className="max-w-3xl mx-auto px-3 sm:px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Brain className="w-3.5 h-3.5 text-primary/70" />
          <span className="font-semibold text-primary/80">Agent working scratchpad</span>
          <span className="text-muted-foreground/50 ml-0.5">({entries.length} {entries.length === 1 ? "entry" : "entries"})</span>
          {streaming && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <span className="ml-auto">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
        </button>
        {open && (
          <div className="pb-3 space-y-1.5 max-h-60 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="text-xs text-muted-foreground/40 py-2">No entries yet for this task.</div>
            ) : (
              entries.map((e, i) => {
                const style = SCRATCH_TYPE_STYLE[e.type] ?? SCRATCH_TYPE_STYLE.note;
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 text-muted-foreground/50 font-mono w-16 text-right">
                      {e.agentName.replace("AURA-", "A")}
                    </span>
                    <span className={cn(
                      "shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      style.color,
                    )}>
                      {style.label}
                    </span>
                    <span className="text-foreground/80 leading-relaxed flex-1 min-w-0 break-words">
                      {e.content}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BridgePill({ status }: { status: { enabled: boolean; tokenConfigured: boolean; channelConfigured: boolean; channelId: string | null } | null }) {
  const ready = Boolean(status?.enabled && status?.tokenConfigured && status?.channelConfigured);
  return (
    <div
      title={ready ? `Discord bridge connected to channel ${status?.channelId}` : "Discord bridge needs DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID"}
      className={cn(
        "hidden lg:flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        ready
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200",
      )}
    >
      <span className={cn("w-2 h-2 rounded-full", ready ? "bg-emerald-400" : "bg-amber-400")} />
      Discord bridge {ready ? "ready" : "needs env"}
    </div>
  );
}

// Claw-style avatars: soft square chips. The swarm gets the coral asterisk;
// the operator gets a muted "U".
function Avatar({ name }: { name: string; color?: string }) {
  if (name === "You") {
    return (
      <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-[13px] font-bold bg-muted border border-card-border text-muted-foreground">
        U
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-primary text-primary-foreground shadow-sm">
      <Asterisk className="w-5 h-5" strokeWidth={2.5} />
    </div>
  );
}

// Copy button rendered under user messages (Claw pattern).
function CopyChip({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(content).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-card border border-card-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MessageRow({ message: m }: { message: { messageType: string; content: string; agentName?: string | null; agentColor?: string | null; timestamp?: string } }) {
  if (m.messageType === "user") {
    return (
      <div className="flex gap-3 group">
        <Avatar name="You" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold mb-1.5 mt-1.5">You</div>
          <div className="chat-bubble-user px-4 py-3 text-sm leading-relaxed">
            <MessageContent content={m.content} />
          </div>
          <CopyChip content={m.content} />
        </div>
      </div>
    );
  }
  if (m.messageType === "system") {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-muted-foreground/70 bg-muted/40 rounded-full px-3 py-1">{m.content}</div>
      </div>
    );
  }
  const color = m.agentColor || "#22d3ee";
  const isTool = m.messageType === "tool_output";
  // The orchestrator writes a hard failure (e.g. a missing LLM API key) straight
  // into the channel as a normal-looking message. Flag it visually instead of
  // letting it blend in as faint, easy-to-miss gray text.
  const isOrchestrationError = /^Orchestration error:/i.test(m.content.trim());
  if (isOrchestrationError) {
    // Server joins fallback parts with "\n\n" — see ensureFinalAnswer() in runtimeGuards.ts
    const [errorLine, ...rest] = m.content.split("\n\n");
    const goalLine = rest.join("\n\n").trim();
    return (
      <div className="flex gap-3 group">
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center border border-destructive/40 bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[12px] font-semibold text-destructive">Orchestration failed</span>
            {m.timestamp && (
              <span className="text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">
            <div className="font-medium">{(errorLine ?? m.content).replace(/^Orchestration error:\s*/i, "")}</div>
            {goalLine && <div className="mt-1.5 text-destructive/70 text-xs">{goalLine}</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 group">
      <Avatar name={m.agentName || "Assistant"} color={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[13px] font-bold mt-1.5">{m.agentName || "AURA-OMEGA"}</span>
          {m.timestamp && (
            <span className="text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        {isTool ? (
          <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 font-mono text-[12px] text-muted-foreground whitespace-pre-wrap break-words overflow-x-auto">
            {m.content}
          </div>
        ) : (
          <div className="chat-bubble-agent px-4 py-3 text-sm leading-relaxed">
            <MessageContent content={m.content} />
            <MessageActions content={m.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// Per-message actions every frontier chat has: copy to clipboard + read aloud (TTS).
function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const speak = () => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) {
      toast.error("Text-to-speech isn't supported in this browser.");
      return;
    }
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    // Strip markdown noise so it reads naturally.
    const clean = content.replace(/[#*`>_~|]/g, " ").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/\s+/g, " ").trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        onClick={copy}
        title="Copy message"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={speak}
        title={speaking ? "Stop" : "Read aloud"}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
      >
        {speaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        {speaking ? "Stop" : "Listen"}
      </button>
    </div>
  );
}

// Kimi-style "thinking" indicator: icon + label + live elapsed timer + dots,
// so the operator can always tell the swarm is actively working (not just
// before the first token, but across the gap while a background mission runs).
function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 py-1" aria-live="polite" aria-label={label}>
      <Brain className="w-4 h-4 text-primary animate-pulse shrink-0" />
      <span className="text-sm text-muted-foreground">
        {label}
        {elapsed > 0 ? ` · ${elapsed}s` : ""}
      </span>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Welcome to AURA-OMEGA</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">Every message you send here is a fully autonomous, end-to-end mission — give it one objective and the swarm runs it through to completion. No need to start a new mission for each step or retry; keep following up in the same thread.</p>
      </div>
      <button onClick={onNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors">
        <Plus className="w-4 h-4" /> New mission
      </button>
    </div>
  );
}

function EmptyConversation({ onPrompt }: { onPrompt: (p: string) => void }) {
  const suggestions = [
    { label: "Social post", prompt: "Write + post a lead-gen Instagram post for AI automation, with a real cited stat" },
    { label: "Email sequence", prompt: "Draft a 7-email nurture sequence (CAN-SPAM compliant) for a real-estate audience" },
    { label: "Content calendar", prompt: "Build a 30-day social media content calendar for a fitness coaching brand" },
    { label: "Market research", prompt: "Research the EV market and build a downloadable PDF brief with TAM/SAM/SOM" },
    { label: "Web scrape", prompt: "Scrape news.ycombinator.com and give me the top 5 stories as a table" },
    { label: "Image gen", prompt: "Generate an ultra realistic image of a husky in the snow" },
  ];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
        <Bot className="w-7 h-7 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">What's the mission?</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Type a goal or pick one below — the swarm runs it autonomously, end-to-end, in this thread. No need to split it into separate chats.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm px-1 sm:px-0">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPrompt(s.prompt)}
            className="text-left rounded-xl border border-border bg-card/70 px-3.5 py-3 hover:border-primary/40 hover:bg-card hover:shadow-sm transition-all group"
          >
            <div className="text-xs font-semibold text-primary mb-0.5 group-hover:text-primary">{s.label}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{s.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

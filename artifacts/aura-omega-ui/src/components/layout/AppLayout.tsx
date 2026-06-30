import { Link, useLocation } from "wouter";
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarClock,
  KeyRound,
  MessageSquare,
  MoreHorizontal,
  Network,
  Settings as SettingsIcon,
  ShieldCheck,
  StickyNote,
  Workflow,
  X,
  Plus,
  Pencil,
  Trash2,
  ServerCog,
  Sparkles,
  Boxes,
  Smartphone,
  Rocket,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  useListChannels,
  useCreateChannel,
  getListChannelsQueryKey,
  resolveApiUrl,
  useGetAuthStatus,
  useLogout,
  getGetAuthStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Manus-style navigation: chat threads live on the left rail, everything else
// sits behind a single "More" drawer. No theatrical 12-link sidebar.
const moreNav = [
  { href: "/scratchpad",  icon: StickyNote,    label: "Scratchpad",    hint: "Pinned context — ABBY reads this always" },
  { href: "/hermes",      icon: Boxes,         label: "Hermes",        hint: "Runtime · skills · heartbeat" },
  { href: "/remote",      icon: Smartphone,    label: "Remote Control",hint: "BOS-OMEGA devices" },
  { href: "/missions",    icon: Rocket,        label: "Missions",      hint: "Durable mission kernel" },
  { href: "/agents",      icon: Bot,           label: "Agents",        hint: "ABBY + AURAs" },
  { href: "/tasks",       icon: Network,       label: "Tasks",         hint: "Task queue" },
  { href: "/tools",       icon: Workflow,      label: "Tools",         hint: "Tool matrix" },
  { href: "/cron",        icon: CalendarClock, label: "Cron",          hint: "Scheduled jobs" },
  { href: "/runtimes",    icon: ServerCog,     label: "Runtimes",      hint: "LLM providers" },
  { href: "/integrations",icon: KeyRound,      label: "Integrations",  hint: "Composio · Firecrawl · Steel" },
  { href: "/settings",    icon: SettingsIcon,  label: "Settings",      hint: "Operator controls" },
];

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function MoreDrawer({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: string;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 bg-card border-r border-border",
          "flex flex-col w-[88%] max-w-[360px] sm:w-72",
        )}
        role="dialog"
        aria-label="More navigation"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">More</span>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="More navigation">
          {moreNav.map((item) => {
            const active = isActive(location, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 min-h-[44px] cursor-pointer transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon
                    className="w-[18px] h-[18px] shrink-0"
                    strokeWidth={active ? 2.2 : 1.75}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm leading-none", active && "font-semibold")}>
                      {item.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 leading-none mt-1 truncate">
                      {item.hint}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

function ChatThreadList({ onItemClick }: { onItemClick?: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: channelsData, isLoading } = useListChannels({
    query: { refetchInterval: 8000, queryKey: getListChannelsQueryKey() },
  });
  const channels = Array.isArray(channelsData) ? channelsData : [];
  const createChannel = useCreateChannel();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (id: number, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    try {
      const res = await fetch(resolveApiUrl(`/api/channels/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
    } catch (err) {
      toast.error("Couldn't rename thread");
    } finally {
      cancelEdit();
    }
  };

  const deleteChannel = async (id: number) => {
    if (!confirm("Delete this thread and all its messages?")) return;
    try {
      const res = await fetch(resolveApiUrl(`/api/channels/${id}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      // If we deleted the active one, route to /
      navigate("/chat");
    } catch (err) {
      toast.error("Couldn't delete thread");
    }
  };

  const handleNewChat = async () => {
    try {
      const result = await createChannel.mutateAsync({ data: { name: "New chat" } });
      const newId = (result as { id?: number })?.id;
      qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      if (newId) {
        navigate(`/chat?c=${newId}`);
      }
      onItemClick?.();
    } catch (err) {
      toast.error("Couldn't create thread");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={handleNewChat}
        disabled={createChannel.isPending}
        className={cn(
          "mx-2 mt-2 mb-3 flex items-center justify-center gap-2 rounded-xl px-3 min-h-[44px]",
          "bg-primary/12 text-primary border border-primary/20",
          "hover:bg-primary/20 active:bg-primary/25 transition-colors text-sm font-medium",
          "disabled:opacity-50",
        )}
        data-testid="new-chat-button"
      >
        <Plus className="w-4 h-4" />
        New chat
      </button>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {isLoading && channels.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 px-3 py-2">Loading…</div>
        ) : channels.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 px-3 py-2">
            No threads yet.
          </div>
        ) : (
          channels.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-xl px-2 min-h-[44px] cursor-pointer transition-colors",
                  "hover:bg-muted active:bg-muted/70 text-foreground/85",
                )}
                onClick={() => {
                  if (!isEditing) {
                    navigate(`/chat?c=${c.id}`);
                    onItemClick?.();
                  }
                }}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEdit(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(c.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent text-sm border-b border-primary outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm truncate">{c.name}</span>
                )}
                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 sm:group-focus-within:opacity-100 flex items-center gap-0.5 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(c.id, c.name);
                      }}
                      className="min-h-[32px] min-w-[32px] p-1.5 rounded hover:bg-background/60 active:bg-background/80 flex items-center justify-center"
                      aria-label="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChannel(c.id);
                      }}
                      className="min-h-[32px] min-w-[32px] p-1.5 rounded hover:bg-background/60 active:bg-background/80 flex items-center justify-center"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [heartbeat, setHeartbeat] = useState<"online" | "offline" | "unknown">("unknown");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const qc = useQueryClient();
  const { data: authStatus } = useGetAuthStatus();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    qc.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
  };

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch("/api/hermes/status");
        if (alive) setHeartbeat(res.ok ? "online" : "offline");
      } catch {
        if (alive) setHeartbeat("offline");
      }
    };
    ping();
    const id = window.setInterval(ping, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans flex-col md:flex-row">

      {/* ── Desktop sidebar — chat threads only (Manus-style) ───────────── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col">
        {/* Logo */}
        <Link href="/chat" data-testid="link-aura-logo">
          <div className="flex items-center gap-3 px-4 py-4 cursor-pointer group select-none border-b border-border">
            <div className="relative w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/25 shrink-0">
              <BrainCircuit className="w-4 h-4 text-primary" />
              <span className={cn(
                "absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full border-2 border-card",
                heartbeat === "online"  ? "bg-emerald-400 animate-pulse" :
                heartbeat === "offline" ? "bg-destructive" :
                                          "bg-muted-foreground",
              )} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-black tracking-tight">AURA-OMEGA</div>
              <div className="text-[10px] text-muted-foreground font-medium">Hermes runtime</div>
            </div>
          </div>
        </Link>

        <ChatThreadList />

        {/* Bottom: More button + status */}
        <div className="border-t border-border p-2 space-y-1">
          <button
            onClick={() => setMoreOpen(true)}
            className="w-full flex items-center gap-2 rounded-xl px-3 min-h-[44px] text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            data-testid="more-button"
          >
            <MoreHorizontal className="w-4 h-4" />
            More
          </button>
          <div className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]",
            heartbeat === "online"
              ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-muted/40 text-muted-foreground",
          )}>
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span className="font-medium truncate">
              {heartbeat === "online" ? "Online" : heartbeat === "offline" ? "Offline" : "Checking…"}
            </span>
          </div>
          {authStatus?.authenticated && (
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="w-full flex items-center gap-2 rounded-xl px-3 min-h-[44px] text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left truncate">{authStatus.displayName ?? authStatus.username}</span>
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {children}
      </main>

      {/* ── More drawer (desktop + mobile) ──────────────────────────────── */}
      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} location={location} />

      {/* ── Mobile: thread drawer ───────────────────────────────────────── */}
      {mobileDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      <div className={cn(
        "md:hidden fixed top-0 left-0 bottom-0 z-50 bg-card border-r border-border",
        "flex flex-col transition-transform duration-200 w-[88%] max-w-[360px]",
        mobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <Link href="/chat" data-testid="link-aura-logo-mobile">
          <div
            onClick={() => setMobileDrawerOpen(false)}
            className="flex items-center gap-3 px-4 py-4 cursor-pointer border-b border-border min-h-[60px]"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/25 shrink-0">
              <BrainCircuit className="w-4 h-4 text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-black tracking-tight">AURA-OMEGA</div>
              <div className="text-[10px] text-muted-foreground font-medium">Hermes runtime</div>
            </div>
          </div>
        </Link>
        <ChatThreadList onItemClick={() => setMobileDrawerOpen(false)} />
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav
        className="md:hidden w-full flex-shrink-0 flex items-stretch border-t border-border bg-card z-20"
        aria-label="Mobile navigation"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 transition-colors",
            mobileDrawerOpen ? "text-primary" : "text-muted-foreground",
          )}
          aria-label="Open threads"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-semibold leading-none">Threads</span>
        </button>
        <button
          onClick={() => navigate("/hermes")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 transition-colors",
            isActive(location, "/hermes") ? "text-primary" : "text-muted-foreground",
          )}
          aria-label="Hermes"
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[10px] font-semibold leading-none">Hermes</span>
        </button>
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 transition-colors",
            moreOpen ? "text-primary" : "text-muted-foreground",
          )}
          aria-label="More"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-semibold leading-none">More</span>
        </button>
      </nav>
    </div>
  );
}
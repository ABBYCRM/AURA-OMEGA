import { Link, useLocation } from "wouter";
import {
  Asterisk,
  Menu as MenuIcon,
  Bot,
  CalendarClock,
  Code2,
  FolderClosed,
  ImageIcon,
  KeyRound,
  Link2,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Network,
  Rocket,
  ServerCog,
  Settings as SettingsIcon,
  Smartphone,
  StickyNote,
  Boxes,
  Sun,
  Workflow,
  X,
  Plus,
  Pencil,
  Trash2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  useListChannels,
  useCreateChannel,
  getListChannelsQueryKey,
  resolveApiUrl,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { IntegrationsPanel, FilesPanel, MyCodePanel } from "./DrawerPanels";

// Every existing surface stays reachable — the Claw drawer's "More" tab hosts
// the full navigation that used to live in the old More drawer.
const moreNav = [
  { href: "/agents",      icon: Bot,           label: "All Agents",    hint: "Swarm + capability launcher" },
  { href: "/scratchpad",  icon: StickyNote,    label: "Scratchpad",    hint: "Pinned context — ABBY reads this always" },
  { href: "/hermes",      icon: Boxes,         label: "Hermes",        hint: "Runtime · skills · heartbeat" },
  { href: "/remote",      icon: Smartphone,    label: "Remote Control",hint: "BOS-OMEGA devices" },
  { href: "/missions",    icon: Rocket,        label: "Missions",      hint: "Durable mission kernel" },
  { href: "/tasks",       icon: Network,       label: "Tasks",         hint: "Task queue" },
  { href: "/tools",       icon: Workflow,      label: "Tools",         hint: "Tool matrix" },
  { href: "/cron",        icon: CalendarClock, label: "Cron",          hint: "Scheduled jobs" },
  { href: "/runtimes",    icon: ServerCog,     label: "Runtimes",      hint: "LLM providers" },
  { href: "/integrations",icon: KeyRound,      label: "Integrations",  hint: "Full console" },
  { href: "/settings",    icon: SettingsIcon,  label: "Settings",      hint: "Operator controls · Stored Secrets" },
];

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

/** The chat header hamburger opens the drawer from anywhere via this event. */
export const OPEN_DRAWER_EVENT = "aura:open-drawer";
export function openAppDrawer() {
  window.dispatchEvent(new CustomEvent(OPEN_DRAWER_EVENT));
}

type DrawerTab = "chats" | "integrations" | "files" | "pictures" | "code" | "more";

const DRAWER_TABS: Array<{ id: DrawerTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "chats",        label: "Chats",        icon: MessageSquare },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "files",        label: "Files",        icon: FolderClosed },
  { id: "pictures",     label: "Pictures",     icon: ImageIcon },
  { id: "code",         label: "My Code",      icon: Code2 },
  { id: "more",         label: "More",         icon: MoreHorizontal },
];

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
      toast.error("Couldn't rename mission");
    } finally {
      cancelEdit();
    }
  };

  const deleteChannel = async (id: number) => {
    if (!confirm("Delete this mission and all its messages?")) return;
    try {
      const res = await fetch(resolveApiUrl(`/api/channels/${id}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      navigate("/chat");
    } catch (err) {
      toast.error("Couldn't delete mission");
    }
  };

  const handleNewChat = async () => {
    try {
      const result = await createChannel.mutateAsync({ data: { name: "New mission", type: "general" } });
      const newId = (result as { id?: number })?.id;
      qc.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      if (newId) {
        navigate(`/chat?c=${newId}`);
      }
      onItemClick?.();
    } catch (err) {
      toast.error("Couldn't create mission");
    }
  };

  // ⌘K / Ctrl+K — new chat, like the reference design's kbd hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={handleNewChat}
        disabled={createChannel.isPending}
        className={cn(
          "mx-2 mt-1 mb-3 flex items-center gap-2 rounded-2xl px-4 min-h-[52px]",
          "bg-card border border-card-border text-foreground",
          "hover:border-primary/40 transition-colors text-sm font-bold",
          "disabled:opacity-50",
        )}
        data-testid="new-chat-button"
      >
        <Plus className="w-4 h-4" />
        New chat
        <kbd className="ml-auto rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">⌘K</kbd>
      </button>

      <div className="px-4 pb-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground/70 select-none">RECENT</div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {isLoading && channels.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 px-3 py-2">Loading…</div>
        ) : channels.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 px-3 py-2">
            No chats yet.
          </div>
        ) : (
          channels.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 rounded-2xl px-3 min-h-[48px] cursor-pointer transition-colors",
                  "bg-card/60 border border-transparent hover:bg-card hover:border-card-border text-foreground/90",
                )}
                onClick={() => {
                  if (!isEditing) {
                    navigate(`/chat?c=${c.id}`);
                    onItemClick?.();
                  }
                }}
              >
                <Star className="w-4 h-4 shrink-0 text-muted-foreground/50" />
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
                  <span className="flex-1 text-sm font-semibold truncate">{c.name}</span>
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

function MorePanel({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1" aria-label="More navigation">
      {moreNav.map((item) => {
        const active = isActive(location, item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <div
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 min-h-[48px] cursor-pointer transition-colors border",
                active
                  ? "bg-primary/12 text-primary border-primary/25"
                  : "bg-card/60 border-transparent text-muted-foreground hover:bg-card hover:border-card-border hover:text-foreground",
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.75} />
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm leading-none font-semibold")}>{item.label}</div>
                <div className="text-[11px] text-muted-foreground/70 leading-none mt-1 truncate">{item.hint}</div>
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

/** The Claw-style drawer: logo header, tab pills, tab panel, Ready/theme footer. */
function DrawerContent({ heartbeat, onClose }: { heartbeat: "online" | "offline" | "unknown"; onClose?: () => void }) {
  const [tab, setTab] = useState<DrawerTab>("chats");
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex flex-col h-full">
      {/* Logo header */}
      <Link href="/chat">
        <div onClick={onClose} className="flex items-center gap-3 px-4 pt-4 pb-3 cursor-pointer select-none">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
            <Asterisk className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="text-xl font-black tracking-tight">AURA-OMEGA</div>
          {onClose && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              className="ml-auto min-h-[40px] min-w-[40px] rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </Link>

      {/* Tab pills */}
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        {DRAWER_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-4 min-h-[44px] text-sm font-bold transition-colors border",
                active
                  ? "bg-secondary text-foreground border-card-border"
                  : "bg-card text-muted-foreground border-card-border hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      {tab === "chats" && <ChatThreadList onItemClick={onClose} />}
      {tab === "integrations" && <IntegrationsPanel onNavigate={onClose} />}
      {tab === "files" && <FilesPanel picturesOnly={false} />}
      {tab === "pictures" && <FilesPanel picturesOnly={true} />}
      {tab === "code" && <MyCodePanel onNavigate={onClose} />}
      {tab === "more" && <MorePanel location={location} onNavigate={onClose} />}

      {/* Footer: Ready + theme toggle */}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn(
            "w-3 h-3 rounded-full",
            heartbeat === "online" ? "bg-emerald-500" : heartbeat === "offline" ? "bg-destructive" : "bg-muted-foreground",
          )} />
          {heartbeat === "online" ? "Ready" : heartbeat === "offline" ? "Offline" : "Checking…"}
        </div>
        <button
          onClick={toggle}
          className="flex items-center gap-2 rounded-2xl bg-card border border-card-border px-4 min-h-[44px] text-sm font-bold"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [heartbeat, setHeartbeat] = useState<"online" | "offline" | "unknown">("unknown");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [location] = useLocation();
  // The chat page renders its own hamburger in the Claw top bar; every other
  // page gets a floating one on mobile so the drawer stays reachable.
  const pageHasOwnHamburger = location === "/" || location.startsWith("/chat");

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

  // The chat header hamburger (and anything else) opens the drawer via event.
  useEffect(() => {
    const open = () => setDrawerOpen(true);
    window.addEventListener(OPEN_DRAWER_EVENT, open);
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, open);
  }, []);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">

      {/* ── Desktop sidebar — the Claw drawer, always visible ─────────────── */}
      <aside className="hidden lg:flex w-[340px] flex-shrink-0 border-r border-border bg-background flex-col">
        <DrawerContent heartbeat={heartbeat} />
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {children}
      </main>

      {/* ── Mobile: floating drawer opener on pages without their own ────── */}
      {!pageHasOwnHamburger && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="lg:hidden fixed bottom-4 left-4 z-30 w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      )}

      {/* ── Mobile/tablet: slide-in drawer ─────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div className={cn(
        "lg:hidden fixed top-0 left-0 bottom-0 z-50 bg-background border-r border-border",
        "flex flex-col transition-transform duration-200 w-[86%] max-w-[400px]",
        drawerOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <DrawerContent heartbeat={heartbeat} onClose={() => setDrawerOpen(false)} />
      </div>
    </div>
  );
}

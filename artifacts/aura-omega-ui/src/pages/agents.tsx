/**
 * All Agents — Claw-style launcher grid.
 *
 * Every tile is wired to a real capability: it picks the composer mode and/or
 * drops a starter prompt into the chat (GOAL_DRAFT_KEY / CHAT_SETUP_KEY
 * handoff), or deep-links to the surface that owns the feature. "Your Swarm"
 * lists the live ABBY/AURA roster; Manage Swarm opens the full roster view
 * with status + tools (the previous Agents page, now at /agents/manage).
 */
import { useLocation, Link } from "wouter";
import { useListAgents } from "@workspace/api-client-react";
import { GOAL_DRAFT_KEY, setChatSetup, type ComposerMode } from "@/lib/handoff";
import { openAppDrawer } from "@/components/layout/AppLayout";
import {
  ArrowLeft, Menu,
  Presentation, Table, FileText,
  MessageSquare, Image as ImageIcon, Clapperboard, Music, AudioLines, Scissors, Podcast,
  NotebookPen, Languages, Bot, Telescope, BadgeCheck, Globe, Inbox,
  PenTool, Code2, Rocket,
} from "lucide-react";

interface Tile {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  mode?: ComposerMode;
  draft?: string;
  href?: string;
}

const SECTIONS: Array<{ title: string; tiles: Tile[] }> = [
  {
    title: "Office Suite",
    tiles: [
      { label: "AI Slides", icon: Presentation, draft: "Build a slide deck outline (title, per-slide bullets, speaker notes) about: " },
      { label: "AI Sheets", icon: Table, draft: "Build a spreadsheet (CSV, with headers and real researched data) of: " },
      { label: "AI Docs", icon: FileText, draft: "Write a complete, polished document about: " },
    ],
  },
  {
    title: "Content Creation",
    tiles: [
      { label: "AI Chat", icon: MessageSquare, mode: "chat" },
      { label: "AI Image", icon: ImageIcon, mode: "image", draft: "Generate an image of: " },
      { label: "AI Video", icon: Clapperboard, mode: "video", draft: "Produce a video for: " },
      { label: "AI Music", icon: Music, draft: "Write structured song lyrics + a production brief (genre, BPM, instrumentation) for: " },
      { label: "AI Audio", icon: AudioLines, draft: "Write a narration script, timed and ready to record, for: " },
      { label: "Clip Genius", icon: Scissors, draft: "Plan short-form clips (hook, cut list, captions) from this source: " },
      { label: "AI Pods", icon: Podcast, draft: "Write a two-host podcast episode script about: " },
    ],
  },
  {
    title: "Tools",
    tiles: [
      { label: "Deep Research", icon: Telescope, draft: "Deep research with cited primary sources, cross-checked: " },
      { label: "Fact Check", icon: BadgeCheck, draft: "Fact-check this claim against at least two independent primary sources: " },
      { label: "Web Scrape", icon: Globe, draft: "Scrape and summarize as a table: " },
      { label: "AI Meeting Notes", icon: NotebookPen, draft: "Turn these meeting notes into minutes, decisions, and action items:\n\n" },
      { label: "Realtime Translation", icon: Languages, draft: "Translate the following, keeping tone and formatting:\n\n" },
      { label: "Inbox", icon: Inbox, draft: "Draft an email (subject + body, ready to send via Resend) to: " },
      { label: "Custom Agent", icon: Bot, href: "/agents/manage" },
    ],
  },
  {
    title: "Build",
    tiles: [
      { label: "Code", icon: Code2, mode: "code", draft: "Build and verify: " },
      { label: "Design / Prototype", icon: PenTool, draft: "Design a UI prototype (layout, components, copy) for: " },
      { label: "Missions", icon: Rocket, href: "/missions" },
    ],
  },
];

function TileButton({ tile, onLaunch }: { tile: Tile; onLaunch: (t: Tile) => void }) {
  const Icon = tile.icon;
  return (
    <button
      onClick={() => onLaunch(tile)}
      className="flex flex-col items-center gap-2.5 group"
      aria-label={tile.label}
    >
      <div className="w-[72px] h-[72px] rounded-2xl bg-card border border-card-border flex items-center justify-center group-hover:border-primary/40 transition-colors">
        <Icon className="w-8 h-8 text-foreground/80" />
      </div>
      <span className="text-[13px] font-semibold text-foreground/85 text-center leading-tight">{tile.label}</span>
    </button>
  );
}

export default function AgentsHub() {
  const [, navigate] = useLocation();
  const { data: agents = [] } = useListAgents();

  const launch = (tile: Tile) => {
    if (tile.href) {
      navigate(tile.href);
      return;
    }
    if (tile.draft) {
      try { sessionStorage.setItem(GOAL_DRAFT_KEY, tile.draft); } catch { /* ignore */ }
    }
    setChatSetup({ mode: tile.mode ?? "chat", agentId: null });
    navigate("/chat");
  };

  const launchAgent = (id: number) => {
    setChatSetup({ mode: "chat", agentId: id });
    navigate("/chat");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-16 shrink-0 flex items-center gap-2 px-3 sm:px-4">
        <button
          onClick={openAppDrawer}
          aria-label="Open menu"
          className="lg:hidden w-11 h-11 rounded-xl bg-card border border-card-border flex items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/chat">
          <button aria-label="Back to chat" className="hidden lg:flex w-11 h-11 rounded-xl bg-card border border-card-border items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-lg font-black tracking-tight pr-11">All Agents</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-10">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Live swarm roster */}
          <section>
            <h2 className="text-[13px] font-bold tracking-[0.14em] text-muted-foreground uppercase mb-4">Your Swarm</h2>
            <div className="grid grid-cols-4 gap-x-2 gap-y-6">
              {agents.map((a) => (
                <button key={a.id} onClick={() => launchAgent(a.id)} className="flex flex-col items-center gap-2.5 group" aria-label={`Chat with ${a.name}`}>
                  <div
                    className="w-[72px] h-[72px] rounded-2xl bg-card border border-card-border flex items-center justify-center text-xl font-black group-hover:border-primary/40 transition-colors"
                    style={{ color: a.color }}
                  >
                    {a.name.replace("AURA-", "A").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-semibold text-foreground/85 text-center leading-tight">{a.name}</span>
                </button>
              ))}
              <TileButton tile={{ label: "Manage Swarm", icon: Bot, href: "/agents/manage" }} onLaunch={launch} />
            </div>
          </section>

          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-[13px] font-bold tracking-[0.14em] text-muted-foreground uppercase mb-4">{s.title}</h2>
              <div className="grid grid-cols-4 gap-x-2 gap-y-6">
                {s.tiles.map((t) => (
                  <TileButton key={t.label} tile={t} onLaunch={launch} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

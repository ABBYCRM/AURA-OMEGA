import { useState } from "react";
import { ChevronRight, GitFork, FolderOpen, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SwarmDimension = {
  index: number;
  name: string;
  role: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
};

export type SwarmDispatchMetadata = {
  isSwarmDispatch: true;
  missionId: number;
  phase: string;
  phaseBold: string;
  phasesRemaining: number | null;
  totalSteps: number;
  dimensions: SwarmDimension[];
};

export function parseSwarmMetadata(metadata: string | null | undefined): SwarmDispatchMetadata | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    if (parsed?.isSwarmDispatch === true && Array.isArray(parsed.dimensions)) {
      return parsed as SwarmDispatchMetadata;
    }
  } catch {
    return null;
  }
  return null;
}

// Per-engine avatar: emoji face + accent colour
const AGENT_AVATAR: Record<string, { emoji: string; color: string; bg: string }> = {
  "AURA-1":  { emoji: "⚡", color: "#60a5fa", bg: "rgba(96,165,250,0.18)" },
  "AURA-2":  { emoji: "🦊", color: "#34d399", bg: "rgba(52,211,153,0.18)" },
  "AURA-3":  { emoji: "🧬", color: "#a78bfa", bg: "rgba(167,139,250,0.18)" },
  "AURA-4":  { emoji: "🔌", color: "#fb923c", bg: "rgba(251,146,60,0.18)" },
  "AURA-5":  { emoji: "📡", color: "#f472b6", bg: "rgba(244,114,182,0.18)" },
  "ABBY":    { emoji: "🧠", color: "#facc15", bg: "rgba(250,204,21,0.18)" },
  Crawler:   { emoji: "🌐", color: "#34d399", bg: "rgba(52,211,153,0.18)" },
  Hermes:    { emoji: "🧠", color: "#a78bfa", bg: "rgba(167,139,250,0.18)" },
  Forge:     { emoji: "⚡", color: "#60a5fa", bg: "rgba(96,165,250,0.18)" },
  Memory:    { emoji: "🧬", color: "#a78bfa", bg: "rgba(167,139,250,0.18)" },
  Brain:     { emoji: "🤖", color: "#fb923c", bg: "rgba(251,146,60,0.18)" },
};

const FALLBACK_AVATARS = [
  { emoji: "🤖", color: "#60a5fa", bg: "rgba(96,165,250,0.18)" },
  { emoji: "🦾", color: "#34d399", bg: "rgba(52,211,153,0.18)" },
  { emoji: "🧩", color: "#a78bfa", bg: "rgba(167,139,250,0.18)" },
  { emoji: "🔬", color: "#fb923c", bg: "rgba(251,146,60,0.18)" },
  { emoji: "🛰️", color: "#f472b6", bg: "rgba(244,114,182,0.18)" },
  { emoji: "🔮", color: "#facc15", bg: "rgba(250,204,21,0.18)" },
];

function getAvatar(name: string, index: number) {
  return AGENT_AVATAR[name] ?? FALLBACK_AVATARS[index % FALLBACK_AVATARS.length];
}

// Single-row dot bar — 15 dots, styled like Kimi signal bars
function DotBar({ progress, status }: { progress: number; status: SwarmDimension["status"] }) {
  const total = 15;
  const filled = status === "done" ? total : Math.round(progress * total);
  const activeColor = status === "failed" ? "#f87171" : "#4ade80";
  const dimColor = status === "failed" ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.12)";
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-[3px] h-[3px] rounded-full"
          style={{ backgroundColor: i < filled ? activeColor : dimColor }}
        />
      ))}
    </div>
  );
}

// "Create Subagent" spawn row — the pre-execution phase
function SpawnRow({ dim }: { dim: SwarmDimension }) {
  const av = getAvatar(dim.name, dim.index);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors cursor-default group">
      {/* person icon */}
      <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </div>
      {/* label */}
      <span className="text-xs text-muted-foreground/70 font-medium">Create Subagent</span>
      {/* divider */}
      <span className="text-muted-foreground/30 text-xs">|</span>
      {/* agent avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 border border-white/10"
        style={{ background: av.bg }}
      >
        {av.emoji}
      </div>
      {/* agent name */}
      <span className="flex-1 text-xs text-foreground/80 font-medium truncate">{dim.name}</span>
      {/* role preview */}
      <span className="text-[10px] text-muted-foreground/50 truncate max-w-[100px] hidden sm:block">{dim.role.slice(0, 32)}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
    </div>
  );
}

// Running agent row — name + index + task + dot bar
function AgentRow({ dim }: { dim: SwarmDimension }) {
  const av = getAvatar(dim.name, dim.index);
  const running = dim.status === "running";
  const done = dim.status === "done";
  const failed = dim.status === "failed";
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-xl mb-1 last:mb-0 transition-colors",
        running ? "bg-white/[0.04]" : "hover:bg-white/[0.025]",
      )}
    >
      {/* Avatar circle */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 border"
        style={{
          background: av.bg,
          borderColor: running ? av.color + "55" : "rgba(255,255,255,0.08)",
          boxShadow: running ? `0 0 10px ${av.color}33` : "none",
        }}
      >
        {av.emoji}
      </div>

      {/* Middle: name + task */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-foreground/90 leading-tight">{dim.name}</span>
          {running && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        <div className="flex items-start gap-1 mt-0.5">
          <span className="text-muted-foreground/40 text-xs mt-[1px] shrink-0">└</span>
          <span className="text-xs text-muted-foreground/70 line-clamp-1">{dim.role}</span>
        </div>
      </div>

      {/* Right: index + dots */}
      <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
        <span
          className={cn(
            "font-mono text-xs font-bold",
            done ? "text-green-400/70" : failed ? "text-red-400/70" : "text-muted-foreground/50",
          )}
        >
          {dim.index.toString().padStart(2, "0")}
        </span>
        <DotBar progress={dim.progress} status={dim.status} />
      </div>
    </div>
  );
}

export function SwarmDispatchMessage({ metadata }: { metadata: SwarmDispatchMetadata }) {
  const [collapsed, setCollapsed] = useState(false);
  const phaseLabel = metadata.phaseBold ?? metadata.phase ?? "Dispatch";
  const dimCount = metadata.dimensions.length;

  // Determine if we're in spawn phase (all queued) or execution phase
  const isSpawnPhase = metadata.dimensions.every((d) => d.status === "queued");
  const runningCount = metadata.dimensions.filter((d) => d.status === "running").length;
  const doneCount = metadata.dimensions.filter((d) => d.status === "done").length;
  const activeCount = runningCount + doneCount;
  const taskBadge = isSpawnPhase ? dimCount : activeCount;

  return (
    <div className="my-2 rounded-2xl border border-white/[0.07] bg-[#111214] overflow-hidden shadow-[0_4px_32px_rgba(0,0,0,0.4)]">

      {/* ── Executing task pill (top of card) ── */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07]">
          {/* green status dot */}
          <span className={cn(
            "w-2 h-2 rounded-full shrink-0",
            isSpawnPhase ? "bg-green-400 animate-pulse" : runningCount > 0 ? "bg-green-400 animate-pulse" : doneCount === dimCount ? "bg-green-400" : "bg-muted-foreground",
          )} />
          <span className="text-sm font-medium text-foreground/90 flex-1 truncate">
            {isSpawnPhase ? "Spawning agents…" : runningCount > 0 ? "Executing task…" : doneCount === dimCount ? "All tasks complete" : "Dispatching…"}
          </span>
          {/* badge + folder icon */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <FolderOpen className="w-4 h-4 text-muted-foreground/60" />
              {taskBadge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-green-500 text-[8px] font-bold text-black flex items-center justify-center leading-none">
                  {taskBadge > 9 ? "9+" : taskBadge}
                </span>
              )}
            </div>
            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground/40" />
          </div>
        </div>
      </div>

      {/* ── Narrative ── */}
      <div className="px-4 pb-3 border-b border-white/[0.05]">
        <div className="text-sm leading-relaxed text-foreground/85">
          {isSpawnPhase
            ? <>Decomposing into <span className="font-bold text-foreground">{dimCount} parallel dimensions</span> — spawning AURAs for mission #<span className="font-mono font-bold">{metadata.missionId || "…"}</span>.</>
            : <>All {dimCount} agents deployed. Now entering <span className="font-bold text-foreground">{phaseLabel}</span> — running {dimCount} sub-tasks in parallel.</>
          }
        </div>
        <div className="text-xs text-muted-foreground/60 mt-1">
          Plan: <span className="font-mono">{metadata.totalSteps}</span> step{metadata.totalSteps === 1 ? "" : "s"},{" "}
          <span className="font-mono">{dimCount}</span> parallel dimension{dimCount === 1 ? "" : "s"}
          {metadata.phasesRemaining != null && metadata.phasesRemaining > 0
            ? `, ${metadata.phasesRemaining} phase${metadata.phasesRemaining === 1 ? "" : "s"} remaining`
            : null}.
        </div>
      </div>

      {/* ── Agent Swarm panel ── */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.025] transition-colors text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <GitFork className="w-3.5 h-3.5 text-muted-foreground/60" />
          <span className="text-xs font-bold text-foreground/80 tracking-wide">Agent Swarm</span>
          <span className="text-xs text-muted-foreground/50 font-mono">| {dimCount} parallel task{dimCount === 1 ? "" : "s"}</span>
        </div>
        <ChevronRight
          className={cn("w-4 h-4 text-muted-foreground/50 transition-transform duration-200", !collapsed && "rotate-90")}
        />
      </button>

      {/* ── Rows ── */}
      {!collapsed && (
        <div className="px-2 pb-3">
          {isSpawnPhase
            ? metadata.dimensions.map((dim) => <SpawnRow key={dim.index} dim={dim} />)
            : metadata.dimensions.map((dim) => <AgentRow key={dim.index} dim={dim} />)
          }
        </div>
      )}
    </div>
  );
}

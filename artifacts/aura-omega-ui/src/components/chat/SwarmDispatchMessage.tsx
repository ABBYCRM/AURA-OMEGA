import { useState } from "react";
import { ChevronRight, ChevronDown, Layers, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Kimi-style mission dispatch display.
 *
 * Renders a multi-line narrative ("Now entering **Phase 2 (Dimension
 * Decomposition)** — dispatching the swarm for mission #NN. Plan: N steps, M
 * parallel dimensions.") followed by an agent-swarm card showing each
 * engine/step as a dimension row. The card is collapsible so the operator can
 * hide it once the mission is in flight.
 *
 * Operator rule 2026-06-27 21:42: be inspired by the reference (Kimi's
 * "Agent Swarm | 12 parallel tasks" card with avatar + role + status dots),
 * don't copy it. Our cards use the actual engine name as the persona label
 * ("Crawler", "Hermes", "Forge", "Memory", "Brain") because those are the
 * real runtimes running the work — not fictional character names.
 */

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

export function SwarmDispatchMessage({ metadata }: { metadata: SwarmDispatchMetadata }) {
  const [collapsed, setCollapsed] = useState(false);
  const phaseLabel = metadata.phaseBold ?? metadata.phase ?? "Dispatch";
  const dimCount = metadata.dimensions.length;

  return (
    <div className="my-2 rounded-xl border border-card-border bg-card/40 overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.2)]">
      {/* Narrative header */}
      <div className="px-4 py-3 border-b border-card-border bg-background/30">
        <div className="text-sm leading-relaxed text-foreground/90">
          Now entering <span className="font-bold text-foreground">{phaseLabel}</span> — dispatching the swarm for mission #
          <span className="font-mono font-bold">{metadata.missionId || "…"}</span>.
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">
          Plan: <span className="font-mono">{metadata.totalSteps}</span> step
          {metadata.totalSteps === 1 ? "" : "s"},{" "}
          <span className="font-mono">{dimCount}</span> parallel dimension
          {dimCount === 1 ? "" : "s"}
          {metadata.phasesRemaining != null && metadata.phasesRemaining > 0
            ? `, ${metadata.phasesRemaining} phase${metadata.phasesRemaining === 1 ? "" : "s"} remaining`
            : null}
          .
        </div>
      </div>

      {/* Agent Swarm card header (collapsible) */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-card/60 transition-colors text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">Agent Swarm</span>
          <span className="text-xs text-muted-foreground font-mono">| {dimCount} parallel tasks</span>
        </div>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Dimension rows (the agent cards) */}
      {!collapsed && (
        <div className="px-2 pb-2">
          {metadata.dimensions.map((dim) => (
            <DimensionRow key={dim.index} dim={dim} />
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionRow({ dim }: { dim: SwarmDimension }) {
  // Status dot column on the right — green for done, animated yellow for running,
  // gray for queued, red for failed. Matches the signal-bars pattern from the
  // reference screenshot without being a 1:1 copy.
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background/40 transition-colors">
      {/* Avatar / engine chip */}
      <div className="w-8 h-8 rounded-lg border border-card-border bg-background/60 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-mono font-bold text-foreground/80">
          {dim.index.toString().padStart(2, "0")}
        </span>
      </div>
      {/* Name + role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wide text-foreground/90">{dim.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {dim.status === "done" ? "✓ done" : dim.status === "running" ? "running" : dim.status === "failed" ? "✗ failed" : "queued"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{dim.role}</div>
      </div>
      {/* Status dots / progress — five dots filling based on progress, matching
          the reference "signal-bars" feel. */}
      <div className="flex items-center gap-1 shrink-0">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = dim.progress > i / 5;
          const status = dim.status;
          return (
            <span
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                status === "failed" && i === 0 ? "bg-red-400" : null,
                status === "done" ? (filled ? "bg-emerald-400" : "bg-emerald-400/20") : null,
                status === "running"
                  ? filled
                    ? "bg-amber-400 animate-pulse"
                    : "bg-amber-400/20"
                  : null,
                status === "queued" ? "bg-muted-foreground/30" : null,
              )}
            />
          );
        })}
        {/* Compact status icon for the human eye */}
        {status === "running" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin ml-1" />}
        {status === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-1" />}
        {status === "failed" && <AlertCircle className="w-3 h-3 text-red-400 ml-1" />}
      </div>
    </div>
  );
}
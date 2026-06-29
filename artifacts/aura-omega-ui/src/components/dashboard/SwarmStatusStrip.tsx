import { Link } from "wouter";
import { useGetSwarmStatus, usePauseSwarm, useResumeSwarm } from "@workspace/api-client-react";
import { FolderOpen, Maximize2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function formatUptime(seconds?: number): string | null {
  if (!seconds || seconds < 1) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

export function SwarmStatusStrip() {
  const { data: status } = useGetSwarmStatus();
  const pauseSwarm = usePauseSwarm();
  const resumeSwarm = useResumeSwarm();

  const paused = status?.paused ?? false;
  const active = status?.activeAgents ?? 0;
  const running = status?.runningTasks ?? 0;
  const done = status?.completedTasks ?? 0;
  const total = status?.totalAgents ?? 0;
  const working = !paused && (active > 0 || running > 0);
  const uptime = formatUptime(status?.uptimeSeconds);

  const statusLabel = paused ? "Paused" : working ? "Executing task…" : "Ready";
  const badge = running > 0 ? running : done > 0 ? done : null;

  const toggle = () => {
    if (paused) resumeSwarm.mutate(undefined as unknown as void);
    else pauseSwarm.mutate(undefined as unknown as void);
  };

  return (
    <div className="shrink-0 px-3 py-2.5 border-b border-white/[0.05] bg-[#0d0e10]/80 backdrop-blur">
      {/* Kimi-style pill — the whole strip IS the pill */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07]">

        {/* Status dot */}
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            paused
              ? "bg-muted-foreground/50"
              : working
              ? "bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]"
              : "bg-green-400/60",
          )}
        />

        {/* Label + sub-text */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground/90">{statusLabel}</span>
          <span className="text-xs text-muted-foreground/50 ml-2.5">
            {active}/{total} agents
            {running > 0 ? ` · ${running} running` : ""}
            {uptime ? ` · up ${uptime}` : ""}
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Task badge + folder */}
          {badge !== null && (
            <div className="relative">
              <FolderOpen className="w-4 h-4 text-muted-foreground/50" />
              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-green-500 text-[8px] font-bold text-black flex items-center justify-center leading-none">
                {badge > 9 ? "9+" : badge}
              </span>
            </div>
          )}

          {/* Pause/resume */}
          <button
            onClick={toggle}
            aria-label={paused ? "Resume swarm" : "Pause swarm"}
            className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-white/20 transition-colors"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>

          {/* Expand → Set goal */}
          <Link href="/">
            <button
              aria-label="Set a goal"
              className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:border-primary/30 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

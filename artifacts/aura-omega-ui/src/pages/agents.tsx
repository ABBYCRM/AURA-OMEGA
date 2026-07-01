import { useListAgents } from "@workspace/api-client-react";
import { useState } from "react";
import {
  Bot, Plus, Play, Square, Settings, Trash2,
  Cpu, Activity, Zap, Clock, Loader2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { color: string; bg: string; dot: string }> = {
  idle: { color: "text-[hsl(0_0%_50%)]", bg: "bg-[hsl(0_0%_12%)]", dot: "bg-[hsl(0_0%_35%)]" },
  thinking: { color: "text-orange-400", bg: "bg-orange-500/10", dot: "bg-orange-400 animate-pulse" },
  executing: { color: "text-orange-400", bg: "bg-orange-500/10", dot: "bg-orange-400 animate-pulse" },
  waiting: { color: "text-yellow-400", bg: "bg-yellow-500/10", dot: "bg-yellow-400" },
  stalled: { color: "text-red-400", bg: "bg-red-500/10", dot: "bg-red-500" },
  hitl: { color: "text-blue-400", bg: "bg-blue-500/10", dot: "bg-blue-400" },
};

export default function Agents() {
  const { data: agents = [], isLoading, isError, refetch } = useListAgents();
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const stats = [
    { label: "Total Agents", value: agents.length.toString(), icon: <Bot size={14} /> },
    { label: "Active Now", value: agents.filter((a: {status:string}) => a.status === "thinking" || a.status === "executing").length.toString(), icon: <Activity size={14} /> },
    { label: "Idle", value: agents.filter((a: {status:string}) => a.status === "idle").length.toString(), icon: <Zap size={14} /> },
    { label: "Avg Uptime", value: "99.9%", icon: <Clock size={14} /> },
  ];

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-3 sm:p-4 lg:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-6 pt-8 sm:pt-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Agents</h2>
          <p className="text-xs sm:text-sm text-[hsl(0_0%_45%)] mt-0.5">Manage your multi-agent workforce</p>
        </div>
        <button className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors shadow-lg shadow-orange-500/20 w-full sm:w-auto">
          <Plus size={16} /> Create Agent
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-[hsl(0_0%_7%)] rounded-xl border border-[hsl(0_0%_14%)] p-3">
            <div className="text-[hsl(0_0%_40%)] mb-1">{s.icon}</div>
            <div className="text-lg font-bold text-white">{s.value}</div>
            <div className="text-[10px] text-[hsl(0_0%_40%)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-orange-400 animate-spin" />
          <span className="ml-2 text-sm text-[hsl(0_0%_45%)]">Loading agents...</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <AlertTriangle size={32} className="text-red-400" />
          <div className="text-sm text-[hsl(0_0%_45%)]">Couldn&apos;t load the agent roster.</div>
          <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[hsl(0_0%_18%)] text-sm text-white hover:border-orange-500/40 transition-all">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center text-[hsl(0_0%_45%)]">
          <Bot size={32} className="opacity-40" />
          <div className="text-sm">No agents found.</div>
          <div className="text-xs max-w-sm">The swarm seeds agents on first run. If none appear, the server may still be starting up.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
          {agents.map((agent: any) => {
            const status = statusConfig[agent.status] || statusConfig.idle;
            const isSelected = selectedAgent === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                className={cn(
                  "bg-[hsl(0_0%_7%)] rounded-xl border transition-all cursor-pointer group",
                  isSelected ? "border-orange-500/40 shadow-lg shadow-orange-500/5" : "border-[hsl(0_0%_14%)] hover:border-[hsl(0_0%_22%)]"
                )}
              >
                <div className="p-3 sm:p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold text-white", status.bg)} style={{ color: agent.color }}>
                        {agent.avatarInitials || agent.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                        <p className="text-[10px] sm:text-[11px] text-[hsl(0_0%_45%)]">{agent.role}</p>
                      </div>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full shrink-0 mt-2", status.dot)} />
                  </div>

                  {agent.description && (
                    <p className="text-[11px] text-[hsl(0_0%_45%)] line-clamp-2 mb-2">{agent.description}</p>
                  )}

                  {/* Context bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] text-[hsl(0_0%_40%)] mb-1">
                      <span>Context</span>
                      <span>{Math.round((agent.contextUsed / agent.contextMax) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[hsl(0_0%_14%)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (agent.contextUsed / agent.contextMax) * 100)}%`, backgroundColor: agent.color || "hsl(24 95% 53%)" }} />
                    </div>
                  </div>

                  {/* Model */}
                  {agent.model && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-[hsl(0_0%_10%)] px-2.5 py-1.5">
                      <Cpu size={12} className="text-[hsl(0_0%_40%)] shrink-0" />
                      <span className="text-[10px] font-mono text-[hsl(0_0%_45%)] truncate">{agent.model}</span>
                    </div>
                  )}

                  {/* Capabilities */}
                  {agent.capabilities && agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {agent.capabilities.slice(0, 6).map((cap: string) => (
                        <span key={cap} className="px-1.5 py-0.5 bg-[hsl(0_0%_12%)] text-[hsl(0_0%_50%)] text-[9px] rounded-full border border-[hsl(0_0%_16%)]">{cap}</span>
                      ))}
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div className="border-t border-[hsl(0_0%_14%)] px-3 sm:px-4 py-2 flex items-center gap-1 animate-fade-in">
                    <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-green-400 hover:bg-green-500/10 transition-colors"><Play size={12} /> Start</button>
                    <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-orange-400 hover:bg-orange-500/10 transition-colors"><Square size={12} /> Stop</button>
                    <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[hsl(0_0%_50%)] hover:bg-[hsl(0_0%_12%)] transition-colors"><Settings size={12} /> Config</button>
                    <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors ml-auto"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

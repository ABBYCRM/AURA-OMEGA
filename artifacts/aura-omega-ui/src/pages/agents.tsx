import { useListAgents } from "@workspace/api-client-react";
import { AgentStatusDot } from "@/components/ui/agent-status-dot";
import { Terminal, Cpu, Activity, AlertTriangle, RefreshCw } from "lucide-react";

export default function Agents() {
  const { data: agents = [], isLoading, isError, refetch } = useListAgents();

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background"></div>
      
      <div className="p-8 border-b border-card-border relative z-10 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
          <Terminal className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Your six AI agents and the tools each one can use.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative z-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-card/50 rounded-xl border border-card-border animate-pulse"></div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <div className="text-sm text-muted-foreground">Couldn't load the agent roster.</div>
            <button onClick={() => refetch()} className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-card-border text-sm text-foreground hover:border-primary/40 transition-all">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Terminal className="w-8 h-8 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground">No agents found.</div>
            <div className="text-xs text-muted-foreground/60 max-w-sm">The swarm seeds six AURA agents on first run. If none appear, the server may still be starting up.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agents.map(agent => (
              <div key={agent.id} className="bg-card border border-border rounded-2xl overflow-hidden group hover:shadow-md hover:border-primary/30 transition-all duration-200">
                {/* Colored top accent */}
                <div className="h-1" style={{ backgroundColor: agent.color }} />

                <div className="p-5">
                  {/* Header row */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ backgroundColor: `${agent.color}18`, color: agent.color, border: `1.5px solid ${agent.color}40` }}
                    >
                      {agent.avatarInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[15px] leading-snug" style={{ color: agent.color }}>{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <AgentStatusDot status={agent.status} />
                        <span className="text-[11px] text-muted-foreground capitalize">{agent.status}</span>
                      </div>
                    </div>
                  </div>

                  {/* Role + description */}
                  <div className="mb-4 space-y-2">
                    <div className="text-sm font-medium text-foreground">{agent.role}</div>
                    {agent.description && (
                      <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{agent.description}</div>
                    )}
                  </div>

                  {/* Context bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                      <span>Context</span>
                      <span>{Math.round((agent.contextUsed / agent.contextMax) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (agent.contextUsed / agent.contextMax) * 100)}%`, backgroundColor: agent.color }}
                      />
                    </div>
                  </div>

                  {/* Model */}
                  {agent.model && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{agent.model}</span>
                    </div>
                  )}

                  {/* Capabilities */}
                  {agent.capabilities && agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {agent.capabilities.slice(0, 6).map(cap => (
                        <span key={cap} className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] rounded-full font-medium">
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}